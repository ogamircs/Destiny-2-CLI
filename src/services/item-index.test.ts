import {
  describe,
  expect,
  test,
  beforeEach,
  mock,
  afterAll,
} from "bun:test";
import type { ProfileResponse, CharacterData } from "../api/profile.ts";
import { DestinyComponentType, BUCKET_SLOT_NAMES, BucketHash } from "../utils/constants.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHAR_A = "char-aaa";
const CHAR_B = "char-bbb";

const ITEM_HASH_WEAPON = 111111;
const ITEM_HASH_ARMOR = 222222;
const ITEM_HASH_STACK = 333333;

// Build a minimal ProfileResponse fixture
function makeProfile(overrides: Partial<ProfileResponse> = {}): ProfileResponse {
  return {
    characters: {
      data: {
        [CHAR_A]: makeCharacter(CHAR_A, 0),
        [CHAR_B]: makeCharacter(CHAR_B, 1),
      },
    },
    characterEquipment: {
      data: {
        [CHAR_A]: {
          items: [
            {
              itemHash: ITEM_HASH_WEAPON,
              itemInstanceId: "inst-weapon-a",
              quantity: 1,
              bucketHash: BucketHash.Kinetic,
              transferStatus: 1, // equipped
              state: 0,
            },
          ],
        },
        [CHAR_B]: { items: [] },
      },
    },
    characterInventories: {
      data: {
        [CHAR_A]: {
          items: [
            {
              itemHash: ITEM_HASH_ARMOR,
              itemInstanceId: "inst-armor-a",
              quantity: 1,
              bucketHash: BucketHash.Helmet,
              transferStatus: 0,
              state: 1, // locked (bit 0)
            },
          ],
        },
        [CHAR_B]: { items: [] },
      },
    },
    profileInventory: {
      data: {
        items: [
          {
            itemHash: ITEM_HASH_STACK,
            itemInstanceId: undefined,
            quantity: 5,
            bucketHash: BucketHash.Consumables,
            transferStatus: 0,
            state: 0,
          },
          {
            itemHash: ITEM_HASH_WEAPON,
            itemInstanceId: "inst-weapon-vault",
            quantity: 1,
            bucketHash: BucketHash.Kinetic,
            transferStatus: 0,
            state: 0,
          },
        ],
      },
    },
    itemComponents: {
      instances: {
        data: {
          "inst-weapon-a": {
            primaryStat: { value: 1800, statHash: 1 },
            isEquipped: true,
            canEquip: false,
            equipRequiredLevel: 1,
            damageType: 2,
          },
          "inst-armor-a": {
            primaryStat: { value: 1750, statHash: 1 },
            isEquipped: false,
            canEquip: true,
            equipRequiredLevel: 1,
            energy: { energyCapacity: 10, energyUsed: 4 },
          },
          "inst-weapon-vault": {
            primaryStat: { value: 1810, statHash: 1 },
            isEquipped: false,
            canEquip: true,
            equipRequiredLevel: 1,
            damageType: 3,
          },
        },
      },
    },
    ...overrides,
  };
}

function makeCharacter(characterId: string, classType: number): CharacterData {
  return {
    characterId,
    membershipId: "member-1",
    membershipType: 3,
    dateLastPlayed: "2025-01-01T00:00:00Z",
    minutesPlayedTotal: "1000",
    light: 1800,
    classType,
    raceType: 0,
    genderType: 0,
    stats: {},
    emblemPath: "",
    emblemBackgroundPath: "",
  };
}

// ---------------------------------------------------------------------------
// Mock manifest-cache.ts
// ---------------------------------------------------------------------------

const MANIFEST_MAP: Record<number, ReturnType<typeof import("./manifest-cache.ts").lookupItem>> = {
  [ITEM_HASH_WEAPON]: {
    hash: ITEM_HASH_WEAPON,
    name: "Ace of Spades",
    itemType: 3,
    itemSubType: 6,
    tierTypeName: "Exotic",
    bucketHash: BucketHash.Kinetic,
    classType: -1,
    icon: "/icon/ace.png",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
  },
  [ITEM_HASH_ARMOR]: {
    hash: ITEM_HASH_ARMOR,
    name: "Helm of the Exile",
    itemType: 2,
    itemSubType: 26,
    tierTypeName: "Legendary",
    bucketHash: BucketHash.Helmet,
    classType: 0,
    icon: "/icon/helm.png",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
  },
  [ITEM_HASH_STACK]: {
    hash: ITEM_HASH_STACK,
    name: "Glimmer",
    itemType: 9,
    itemSubType: 0,
    tierTypeName: "Common",
    bucketHash: BucketHash.Consumables,
    classType: -1,
    icon: "/icon/glimmer.png",
    maxStackSize: 250,
    nonTransferrable: false,
    equippable: false,
  },
};

mock.module("./manifest-cache.ts", () => ({
  lookupItem: (hash: number) => MANIFEST_MAP[hash] ?? null,
}));

// ---------------------------------------------------------------------------
// Import after mock is set up
// ---------------------------------------------------------------------------
const { buildInventoryIndex, getRequiredComponents } = await import(
  `./item-index.ts?test=${Date.now()}`
);

afterAll(() => mock.restore());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getRequiredComponents", () => {
  test("returns exactly the expected component array", () => {
    const comps = getRequiredComponents();
    expect(comps).toEqual([
      DestinyComponentType.Characters,
      DestinyComponentType.CharacterInventories,
      DestinyComponentType.CharacterEquipment,
      DestinyComponentType.ProfileInventories,
      DestinyComponentType.ItemInstances,
    ]);
  });
});

describe("buildInventoryIndex", () => {
  const characters = [makeCharacter(CHAR_A, 0), makeCharacter(CHAR_B, 1)];

  test("populates byInstanceId for instanced items", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    expect(idx.byInstanceId.has("inst-weapon-a")).toBe(true);
    expect(idx.byInstanceId.has("inst-armor-a")).toBe(true);
    expect(idx.byInstanceId.has("inst-weapon-vault")).toBe(true);
    // non-instanced stackable should not be in byInstanceId
    expect(idx.byInstanceId.size).toBe(3);
  });

  test("byHash groups multiple copies of same hash", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    const weaponCopies = idx.byHash.get(ITEM_HASH_WEAPON);
    expect(weaponCopies).toHaveLength(2); // one on char A equipment, one in vault
  });

  test("vault items appear in vaultItems but not byCharacter", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    expect(idx.vaultItems).toHaveLength(2); // glimmer stack + vault weapon
    // Vault items should not appear in any character bucket
    for (const [, items] of idx.byCharacter) {
      for (const item of items) {
        expect(item.location).not.toBe("vault");
      }
    }
  });

  test("byCharacter maps character id to its items only", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    const charAItems = idx.byCharacter.get(CHAR_A)!;
    expect(charAItems).toBeDefined();
    // Char A has equipped weapon + armour in inventory = 2 items
    expect(charAItems).toHaveLength(2);
    // Char B has no items
    expect(idx.byCharacter.get(CHAR_B)).toBeUndefined();
  });

  test("isLocked reads bit 0 of state correctly", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    const armor = idx.byInstanceId.get("inst-armor-a")!;
    expect(armor.isLocked).toBe(true);

    const weapon = idx.byInstanceId.get("inst-weapon-a")!;
    expect(weapon.isLocked).toBe(false);
  });

  test("instance data merged: power and damageType", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    const weapon = idx.byInstanceId.get("inst-weapon-a")!;
    expect(weapon.power).toBe(1800);
    expect(weapon.damageType).toBe(2);
    expect(weapon.isEquipped).toBe(true);
    expect(weapon.canEquip).toBe(false);
  });

  test("armor energy fields merged from instance", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    const armor = idx.byInstanceId.get("inst-armor-a")!;
    expect(armor.energyCapacity).toBe(10);
    expect(armor.energyUsed).toBe(4);
  });

  test("missing instance data yields graceful undefined fallback", () => {
    const profile = makeProfile();
    // Remove instances entirely
    delete (profile as any).itemComponents;
    const idx = buildInventoryIndex(profile, characters);
    const weapon = idx.byInstanceId.get("inst-weapon-a");
    // Without instance data, power/damageType are undefined
    expect(weapon?.power).toBeUndefined();
    expect(weapon?.damageType).toBeUndefined();
    expect(weapon?.isEquipped).toBe(false);
  });

  test("unknown manifest item (lookupItem returns null) is skipped", () => {
    const profile = makeProfile();
    // Inject item with an unmapped hash
    profile.profileInventory!.data!.items.push({
      itemHash: 9999999,
      itemInstanceId: "inst-unknown",
      quantity: 1,
      bucketHash: BucketHash.General,
      transferStatus: 0,
      state: 0,
    });
    const idx = buildInventoryIndex(profile, characters);
    expect(idx.byInstanceId.has("inst-unknown")).toBe(false);
  });

  test("perks is undefined on all items (not yet fetched)", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    for (const item of idx.all) {
      expect(item.perks).toBeUndefined();
    }
  });

  test("slot resolves from item bucketHash via BUCKET_SLOT_NAMES", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    const weapon = idx.byInstanceId.get("inst-weapon-a")!;
    expect(weapon.slot).toBe("Kinetic");
    const armor = idx.byInstanceId.get("inst-armor-a")!;
    expect(armor.slot).toBe("Helmet");
  });

  test("all array contains every indexed item", () => {
    const idx = buildInventoryIndex(makeProfile(), characters);
    // weapon-a (char equip) + armor-a (char inv) + glimmer (vault) + weapon-vault = 4
    expect(idx.all).toHaveLength(4);
  });
});
