import { AUTH_URL, OAUTH_CALLBACK_PORT, API_BASE } from "../utils/constants.ts";
import { getConfig, getLocalPaths, ensureDirs } from "./config.ts";
import { saveTokens, type StoredTokens } from "./token-store.ts";
import { exchangeCode } from "../api/auth.ts";
import { AuthError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";
import open from "open";
import { join } from "path";
import { existsSync } from "fs";
import { $ } from "bun";

const CALLBACK_URL = `https://localhost:${OAUTH_CALLBACK_PORT}/callback`;

interface MembershipResponse {
  destinyMemberships: Array<{
    membershipType: number;
    membershipId: string;
    displayName: string;
    crossSaveOverride: number;
  }>;
  primaryMembershipId?: string;
  bungieNetUser: {
    membershipId: string;
    displayName: string;
  };
}

async function ensureTlsCert(): Promise<{ cert: string; key: string }> {
  const paths = getLocalPaths();
  const certPath = join(paths.configDir, "localhost.crt");
  const keyPath = join(paths.configDir, "localhost.key");

  if (!existsSync(certPath) || !existsSync(keyPath)) {
    debug("Generating self-signed TLS cert for localhost...");
    await $`openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 3650 -nodes -subj "/CN=localhost" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"`.quiet();
  }

  return {
    cert: await Bun.file(certPath).text(),
    key: await Bun.file(keyPath).text(),
  };
}

export async function login(): Promise<StoredTokens> {
  const config = getConfig();
  await ensureDirs();

  const tls = await ensureTlsCert();
  const authUrl = `${AUTH_URL}?client_id=${config.clientId}&response_type=code`;

  return new Promise<StoredTokens>((resolve, reject) => {
    let server: ReturnType<typeof Bun.serve>;
    const timeout = setTimeout(() => {
      server?.stop();
      reject(new AuthError("OAuth flow timed out after 120 seconds"));
    }, 120_000);

    server = Bun.serve({
      port: OAUTH_CALLBACK_PORT,
      tls,
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname !== "/callback") {
          return new Response("Not found", { status: 404 });
        }

        const code = url.searchParams.get("code");
        if (!code) {
          return new Response("Missing authorization code", { status: 400 });
        }

        try {
          debug("Received auth code, exchanging for tokens...");
          const tokenRes = await exchangeCode(code);
          const now = Date.now();

          // Fetch membership info
          debug("Fetching membership info...");
          const membershipRes = await fetch(
            `${API_BASE}/User/GetMembershipsForCurrentUser/`,
            {
              headers: {
                "X-API-Key": config.apiKey,
                Authorization: `Bearer ${tokenRes.access_token}`,
              },
            }
          );

          if (!membershipRes.ok) {
            throw new AuthError("Failed to fetch membership info");
          }

          const membershipJson = (await membershipRes.json()) as {
            Response: MembershipResponse;
          };
          const membershipData = membershipJson.Response;

          // Find the primary Destiny membership (prefer cross-save primary)
          const memberships = membershipData.destinyMemberships;
          let primary = memberships.find(
            (m) => m.membershipId === membershipData.primaryMembershipId
          );
          if (!primary) {
            primary = memberships.find(
              (m) => m.crossSaveOverride === m.membershipType
            );
          }
          if (!primary) {
            primary = memberships[0];
          }

          if (!primary) {
            throw new AuthError("No Destiny memberships found on this account");
          }

          const tokens: StoredTokens = {
            accessToken: tokenRes.access_token,
            refreshToken: tokenRes.refresh_token,
            accessTokenExpiresAt: now + tokenRes.expires_in * 1000,
            refreshTokenExpiresAt: now + tokenRes.refresh_expires_in * 1000,
            membershipId: tokenRes.membership_id,
            bungieMembershipType: primary.membershipType,
            destinyMembershipId: primary.membershipId,
            destinyMembershipType: primary.membershipType,
            displayName:
              primary.displayName ||
              membershipData.bungieNetUser.displayName,
          };

          await saveTokens(tokens);
          clearTimeout(timeout);
          server.stop();
          resolve(tokens);

          return new Response(
            `<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#0d0d0d;color:#fff">
              <h1 style="color:#c5a84e">✓ Logged in!</h1>
              <p>Welcome, ${tokens.displayName}. You can close this tab and return to the terminal.</p>
            </body></html>`,
            { headers: { "Content-Type": "text/html" } }
          );
        } catch (err) {
          clearTimeout(timeout);
          server.stop();
          reject(err);
          return new Response("Authentication failed", { status: 500 });
        }
      },
    });

    debug(`OAuth callback server listening on ${CALLBACK_URL}`);
    console.log(`\n  Opening browser for Bungie authorization...`);
    console.log(`  (If the browser shows a security warning, click Advanced → Proceed to localhost)\n`);
    open(authUrl);
  });
}
