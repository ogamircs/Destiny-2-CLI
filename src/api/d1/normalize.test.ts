import { describe, expect, test } from "bun:test";
import {
  collectD1Items,
  normalizeD1Account,
  normalizeD1Item,
} from "./normalize.ts";
import { toProfileResponse } from "../../services/d1-profile.ts";

describe("Destiny 1 normalization", () => {
  test("reads item id, stack size, lock state, and perks from either field name", () => {
    const item = normalizeD1Item(
      {
        itemHash: 100,
        itemId: "42",
        stackSize: 3,
        locked: true,
        isEquipped: true,
        primaryStat: { value: 320 },
        damageType: 2,
        perks: [{ perkHash: 7 }, { perkHash: 0 }],
      },
      1498876634
    );

    expect(item).toMatchObject({
      itemHash: 100,
      itemInstanceId: "42",
      quantity: 3,
      bucketHash: 1498876634,
      locked: true,
      isEquipped: true,
      power: 320,
      damageType: 2,
      perkHashes: [7],
    });
  });

  test("collects items from the vault's flat bucket array", () => {
    const items = collectD1Items({
      data: {
        buckets: [
          { bucketHash: 1498876634, items: [{ itemHash: 10, itemInstanceId: "vault-1" }] },
          { bucketHash: 2465295065, items: [{ itemHash: 11, itemId: "vault-2", stackSize: 4 }] },
        ],
      },
    });

    expect(items.map((item) => [item.itemHash, item.bucketHash, item.quantity])).toEqual([
      [10, 1498876634, 1],
      [11, 2465295065, 4],
    ]);
  });

  test("collects items from bucket groups that are either arrays or a single bucket", () => {
    const items = collectD1Items({
      data: {
        buckets: {
          Equippable: [{ bucketHash: 1, items: [{ itemHash: 10, itemInstanceId: "a" }] }],
          Item: { bucketHash: 2, items: [{ itemHash: 11, itemId: "0", quantity: 5 }] },
        },
      },
    });

    expect(items.map((item) => item.itemHash)).toEqual([10, 11]);
    expect(items[1]?.itemInstanceId).toBeUndefined();
    expect(items[1]?.quantity).toBe(5);
  });

  test("maps an account payload onto the shared profile shape", () => {
    const account = normalizeD1Account({
      data: {
        membershipId: "psn-1",
        membershipType: 2,
        grimoireScore: 4321,
        dateLastPlayed: "2017-09-01T00:00:00Z",
        characters: [
          {
            characterBase: {
              characterId: "char-1",
              membershipId: "psn-1",
              membershipType: 2,
              dateLastPlayed: "2017-09-01T00:00:00Z",
              minutesPlayedTotal: "120",
              powerLevel: 320,
              classType: 1,
              raceHash: 3887404748,
              genderType: 0,
              grimoireScore: 4321,
            },
            characterLevel: 40,
            emblemPath: "/emblem.png",
          },
        ],
      },
    });

    const profile = toProfileResponse({
      membership: {
        membershipType: 2,
        membershipId: "psn-1",
        displayName: "Guardian",
      },
      grimoireScore: account.grimoireScore,
      dateLastPlayed: account.dateLastPlayed,
      vaultItems: [
        {
          itemHash: 55,
          itemInstanceId: "vault-item",
          quantity: 1,
          bucketHash: 1498876634,
          transferStatus: 0,
          locked: false,
          isEquipped: false,
          canEquip: true,
          power: 310,
          damageType: 1,
          perkHashes: [],
        },
      ],
      characters: account.characters.map((character) => ({
        ...character,
        items: [
          {
            itemHash: 99,
            itemInstanceId: "equipped-item",
            quantity: 1,
            bucketHash: 3448274439,
            transferStatus: 1,
            locked: false,
            isEquipped: true,
            canEquip: true,
            power: 320,
            damageType: 3,
            perkHashes: [123],
          },
        ],
      })),
    });

    expect(account.characters[0]).toMatchObject({
      characterId: "char-1",
      light: 320,
      level: 40,
      classType: 1,
      raceType: 0,
    });
    expect(profile.d1?.grimoireScore).toBe(4321);
    expect(profile.characterEquipment?.data["char-1"]?.items[0]?.itemHash).toBe(99);
    expect(profile.characterInventories?.data["char-1"]?.items).toEqual([]);
    expect(profile.profileInventory?.data.items[0]?.itemInstanceId).toBe("vault-item");
    expect(profile.itemComponents?.instances?.data["equipped-item"]?.primaryStat?.value).toBe(320);
    expect(profile.itemComponents?.perks?.data["equipped-item"]?.perks[0]?.perkHash).toBe(123);
    expect(profile.characters?.data["char-1"]?.light).toBe(320);
  });
});
