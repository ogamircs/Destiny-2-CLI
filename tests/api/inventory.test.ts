import { afterAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { AuthError } from "../../src/utils/errors.ts";

let tokens: any = {
  destinyMembershipType: 2,
};

const apiRequestMock = mock(async () => undefined);

mock.module("../../src/services/token-store.ts", () => ({
  loadTokens: () => tokens,
}));

mock.module("../../src/api/client.ts", () => ({
  apiRequest: apiRequestMock,
}));

const { equipItem, transferItem } = await import("../../src/api/inventory.ts");

beforeEach(() => {
  tokens = { destinyMembershipType: 2 };
  apiRequestMock.mockClear();
});

describe("api/inventory", () => {
  test("transferItem throws when not logged in", async () => {
    tokens = null;
    await expect(transferItem(1, 1, true, "inst", "char")).rejects.toBeInstanceOf(
      AuthError
    );
  });

  test("transferItem posts transfer payload", async () => {
    await transferItem(123, 3, true, "inst1", "char1");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/Destiny2/Actions/Items/TransferItem/",
      {
        method: "POST",
        body: {
          itemReferenceHash: 123,
          stackSize: 3,
          transferToVault: true,
          itemId: "inst1",
          characterId: "char1",
          membershipType: 2,
        },
      }
    );
  });

  test("equipItem posts equip payload", async () => {
    await equipItem("inst2", "char2");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "/Destiny2/Actions/Items/EquipItem/",
      {
        method: "POST",
        body: {
          itemId: "inst2",
          characterId: "char2",
          membershipType: 2,
        },
      }
    );
  });
});

afterAll(() => {
  mock.restore();
});
