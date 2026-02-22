import { afterAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { AuthError } from "../../src/utils/errors.ts";

let tokens: any = {
  destinyMembershipType: 3,
  destinyMembershipId: "abc",
};

const apiRequestMock = mock(async () => ({ mergedAllCharacters: { results: {} } }));

mock.module("../../src/services/token-store.ts", () => ({
  loadTokens: () => tokens,
}));

mock.module("../../src/api/client.ts", () => ({
  apiRequest: apiRequestMock,
}));

const { getAccountStats, getCharacterStats } = await import(
  "../../src/api/stats.ts"
);

beforeEach(() => {
  tokens = {
    destinyMembershipType: 3,
    destinyMembershipId: "abc",
  };
  apiRequestMock.mockClear();
});

describe("api/stats", () => {
  test("throws when not logged in", async () => {
    tokens = null;
    await expect(getAccountStats()).rejects.toBeInstanceOf(AuthError);
  });

  test("getAccountStats builds URL without modes", async () => {
    await getAccountStats();
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/Destiny2/3/Account/abc/Stats/"
    );
  });

  test("getAccountStats appends mode query", async () => {
    await getAccountStats([5, 7]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/Destiny2/3/Account/abc/Stats/?modes=5,7"
    );
  });

  test("getCharacterStats builds URL and mode query", async () => {
    await getCharacterStats("char-1", [84]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/Destiny2/3/Account/abc/Character/char-1/Stats/?modes=84"
    );
  });
});

afterAll(() => {
  mock.restore();
});
