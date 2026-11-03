import { afterAll, describe, expect, mock, test } from "bun:test";
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
    const bytes = writeZip(payload, "world_sql_content.content");
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

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function storedZip(fileName: string, contents: string): Uint8Array {
  const data = new TextEncoder().encode(contents);
  const name = new TextEncoder().encode(fileName);
  const crc = crc32(data);
  const local = new Uint8Array(30 + name.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, data.length, true);
  localView.setUint32(22, data.length, true);
  localView.setUint16(26, name.length, true);
  local.set(name, 30);
  local.set(data, 30 + name.length);

  const central = new Uint8Array(46 + name.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(4, 20, true);
  centralView.setUint16(6, 20, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, data.length, true);
  centralView.setUint16(28, name.length, true);
  central.set(name, 46);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, 1, true);
  endView.setUint16(10, 1, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, local.length, true);

  const zip = new Uint8Array(local.length + central.length + end.length);
  zip.set(local, 0);
  zip.set(central, local.length);
  zip.set(end, local.length + central.length);
  return zip;
}

function writeZip(contents: string, fileName: string): Uint8Array {
  return storedZip(fileName, contents);
}
