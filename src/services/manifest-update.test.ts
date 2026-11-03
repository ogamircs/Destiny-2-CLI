import { afterAll, describe, expect, mock, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { ManifestError } from "../utils/errors.ts";

const manifestDir = mkdtempSync(join(tmpdir(), "destiny-manifest-update-"));

mock.module("./config.ts", () => ({
  getLocalPaths: () => ({
    configDir: manifestDir,
    cacheDir: manifestDir,
    tokenPath: join(manifestDir, "tokens.json"),
    manifestDir,
  }),
  getConfig: () => {
    throw new Error("getConfig should not be called while updating the manifest");
  },
}));

const manifestInfo = {
  version: "test-version-1",
  mobileWorldContentPaths: { en: "/en/world.content" },
};

mock.module("../api/manifest.ts", () => ({
  getManifestInfo: async () => manifestInfo,
  getManifestDbUrl: () => "https://example.test/manifest.zip",
}));

const { updateManifest } = await import(`./manifest-cache.ts?update=${Date.now()}`);

afterAll(() => {
  rmSync(manifestDir, { recursive: true, force: true });
  mock.restore();
});

describe("updateManifest", () => {
  test("extracts the content database before recording the version", async () => {
    const payload = "manifest-bytes";
    const bytes = await writeZip(payload, "world_sql_content.content");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(bytes, { status: 200 })) as typeof fetch;

    try {
      await updateManifest();
    } finally {
      globalThis.fetch = originalFetch;
    }

    const dbPath = join(manifestDir, "manifest.sqlite3");
    const version = (await Bun.file(join(manifestDir, "manifest-version.txt")).text()).trim();
    expect(version).toBe("test-version-1");
    expect(await Bun.file(dbPath).text()).toBe(payload);
    expect(await Bun.file(join(manifestDir, "manifest.zip")).exists()).toBe(false);
    expect(await Bun.file(join(manifestDir, "world_sql_content.content")).exists()).toBe(false);
  });

  test("does not record a version when the zip cannot be extracted", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("not-a-zip", { status: 200 })) as typeof fetch;
    const versionPath = join(manifestDir, "manifest-version.txt");
    await Bun.write(versionPath, "previous-version");

    try {
      await expect(updateManifest()).rejects.toBeInstanceOf(ManifestError);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect((await Bun.file(versionPath).text()).trim()).toBe("previous-version");
  });
});

async function writeZip(contents: string, fileName: string): Promise<Uint8Array> {
  const sourceDir = mkdtempSync(join(tmpdir(), "destiny-manifest-zip-src-"));
  try {
    const zipPath = join(sourceDir, "manifest.zip");
    const contentPath = join(sourceDir, fileName);
    await Bun.write(contentPath, contents);
    const result = spawnSync("zip", ["-j", zipPath, contentPath], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(result.stderr || "zip failed");
    }
    const bytes = new Uint8Array(await Bun.file(zipPath).arrayBuffer());
    return bytes;
  } finally {
    rmSync(sourceDir, { recursive: true, force: true });
  }
}
