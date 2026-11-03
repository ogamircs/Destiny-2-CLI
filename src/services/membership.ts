import { apiRequest } from "../api/client.ts";
import {
  getGame,
  getPlatformOverride,
  isDestiny1Platform,
  platformName,
} from "../games/context.ts";
import {
  loadTokens,
  saveTokens,
  type LinkedMembership,
  type StoredTokens,
} from "./token-store.ts";
import { AuthError } from "../utils/errors.ts";

export type { LinkedMembership };

export function selectD1Membership(
  memberships: LinkedMembership[],
  platformOverride?: number
): LinkedMembership {
  const playable = memberships.filter((membership) =>
    isDestiny1Platform(membership.membershipType)
  );

  if (platformOverride !== undefined) {
    if (!isDestiny1Platform(platformOverride)) {
      throw new Error(
        `Destiny 1 was only released on Xbox and PlayStation. ${platformName(platformOverride)} has no Destiny 1 characters.`
      );
    }
    const match = playable.find((membership) => membership.membershipType === platformOverride);
    if (!match) {
      throw new Error(
        `No ${platformName(platformOverride)} Destiny membership is linked to this Bungie account.`
      );
    }
    return match;
  }

  if (playable.length === 1) return playable[0]!;
  if (playable.length === 0) {
    throw new Error(
      "No Destiny 1 membership found. Destiny 1 is Xbox and PlayStation only. Link the console account that owns those characters, then run: destiny auth login"
    );
  }

  const choices = playable
    .map((membership) => platformName(membership.membershipType))
    .join(", ");
  throw new Error(
    `Multiple Destiny 1 platforms are linked (${choices}). Pass --platform xbox or --platform psn.`
  );
}

async function refreshLinkedMemberships(tokens: StoredTokens): Promise<LinkedMembership[]> {
  const response = await apiRequest<{
    destinyMemberships?: LinkedMembership[];
  }>("/User/GetMembershipsForCurrentUser/");
  const memberships = (response.destinyMemberships ?? [])
    .filter((membership) => membership.membershipId && membership.membershipType)
    .map((membership) => ({
      membershipType: membership.membershipType,
      membershipId: String(membership.membershipId),
      displayName: membership.displayName || tokens.displayName,
    }));

  if (memberships.length > 0) {
    await saveTokens({ ...tokens, memberships });
  }
  return memberships;
}

export async function resolveActiveMembership(): Promise<LinkedMembership> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new AuthError("Not logged in. Run: destiny auth login");
  }

  if (getGame() === "d2") {
    return {
      membershipType: tokens.destinyMembershipType,
      membershipId: tokens.destinyMembershipId,
      displayName: tokens.displayName,
    };
  }

  let memberships = tokens.memberships ?? [];
  if (memberships.length === 0) {
    try {
      memberships = await refreshLinkedMemberships(tokens);
    } catch {
      memberships = [
        {
          membershipType: tokens.destinyMembershipType,
          membershipId: tokens.destinyMembershipId,
          displayName: tokens.displayName,
        },
      ];
    }
  }

  return selectD1Membership(memberships, getPlatformOverride());
}
