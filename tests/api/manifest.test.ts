import { afterAll, describe, expect, test, mock } from "bun:test";

const apiRequestMock = mock(async () => ({
  version: "v1",
  mobileWorldContentPaths: { en: "/path/en.content" },
}));

mock.module("../../src/api/client.ts", () => ({
  apiRequest: apiRequestMock,
}));

const { getManifestDbUrl, getManifestInfo } = await import(
  "../../src/api/manifest.ts"
);

describe("api/manifest", () => {
  test("getManifestInfo delegates to apiRequest", async () => {
    const info = await getManifestInfo();
    expect(apiRequestMock).toHaveBeenCalledWith("/Destiny2/Manifest/", {
      auth: false,
    });
    expect(info.version).toBe("v1");
  });

  test("getManifestDbUrl prefers english path", () => {
    const url = getManifestDbUrl({
      version: "v2",
      mobileWorldContentPaths: {
        fr: "/path/fr.content",
        en: "/path/en.content",
      },
    });
    expect(url).toBe("https://www.bungie.net/path/en.content");
  });

  test("getManifestDbUrl falls back to first available path", () => {
    const url = getManifestDbUrl({
      version: "v2",
      mobileWorldContentPaths: {
        fr: "/path/fr.content",
      },
    });
    expect(url).toBe("https://www.bungie.net/path/fr.content");
  });

  test("getManifestDbUrl throws when no paths exist", () => {
    expect(() =>
      getManifestDbUrl({
        version: "v3",
        mobileWorldContentPaths: {},
      })
    ).toThrow("No manifest DB path found");
  });
});

afterAll(() => {
  mock.restore();
});
