import { afterAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { AuthError } from "../../src/utils/errors.ts";

let tokens: any = {
  destinyMembershipType: 3,
  destinyMembershipId: "999",
};

const apiRequestMock = mock(async () => ({ ok: true }));

mock.module("../../src/services/token-store.ts", () => ({
  loadTokens: () => tokens,
}));

mock.module("../../src/api/client.ts", () => ({
  apiRequest: apiRequestMock,
}));

const { getProfile } = await import("../../src/api/profile.ts");

beforeEach(() => {
  tokens = {
    destinyMembershipType: 3,
    destinyMembershipId: "999",
  };
  apiRequestMock.mockClear();
});

describe("api/profile", () => {
  test("throws when not logged in", async () => {
    tokens = null;
    await expect(getProfile([100, 200])).rejects.toBeInstanceOf(AuthError);
  });

  test("builds profile endpoint with joined components", async () => {
    await getProfile([100, 200, 300]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/Destiny2/3/Profile/999/?components=100,200,300"
    );
  });
});

afterAll(() => {
  mock.restore();
});
