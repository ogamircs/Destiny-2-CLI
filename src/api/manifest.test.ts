import { describe, expect, test, mock } from "bun:test";

async function setupManifestTest() {
  const apiRequestMock = mock(async () => ({}));
  mock.module("./client.ts", () => ({
    apiRequest: apiRequestMock,
  }));

  const mod = await import(`./manifest.ts?test=${Date.now()}-${Math.random()}`);
  return {
    ...mod,
    apiRequestMock,
    cleanup: () => mock.restore(),
  };
}

describe("manifest API", () => {
  test("requests manifest info without auth", async () => {
    const ctx = await setupManifestTest();
    try {
      const manifest = {
        version: "v1",
        mobileWorldContentPaths: { en: "/path/to/en.content" },
      };
      ctx.apiRequestMock.mockResolvedValue(manifest);

      const response = await ctx.getManifestInfo();
      expect(ctx.apiRequestMock).toHaveBeenCalledWith("/Destiny2/Manifest/", {
        auth: false,
      });
      expect(response).toEqual(manifest);
    } finally {
      ctx.cleanup();
    }
  });

  test("prefers english manifest DB URL", async () => {
    const ctx = await setupManifestTest();
    try {
      const url = ctx.getManifestDbUrl({
        version: "v2",
        mobileWorldContentPaths: {
          fr: "/fr.content",
          en: "/en.content",
        },
      });

      expect(url).toBe("https://www.bungie.net/en.content");
    } finally {
      ctx.cleanup();
    }
  });

  test("falls back to first available manifest path", async () => {
    const ctx = await setupManifestTest();
    try {
      const url = ctx.getManifestDbUrl({
        version: "v3",
        mobileWorldContentPaths: {
          ja: "/jp.content",
        },
      });

      expect(url).toBe("https://www.bungie.net/jp.content");
    } finally {
      ctx.cleanup();
    }
  });

  test("throws when manifest path is missing", async () => {
    const ctx = await setupManifestTest();
    try {
      expect(() =>
        ctx.getManifestDbUrl({
          version: "v4",
          mobileWorldContentPaths: {},
        })
      ).toThrow("No manifest DB path found");
    } finally {
      ctx.cleanup();
    }
  });
});
