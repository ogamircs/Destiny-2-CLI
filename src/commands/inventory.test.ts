import { describe, expect, test, mock } from "bun:test";
import { Command } from "commander";
import { BucketHash, DestinyComponentType } from "../utils/constants.ts";

function makeProfileFixture() {
  return {
    characters: {
      data: {
        hunter: {
          characterId: "hunter",
          membershipId: "1",
          membershipType: 3,
          dateLastPlayed: "2025-01-02T00:00:00.000Z",
          minutesPlayedTotal: "100",
          light: 2000,
          classType: 1,
          raceType: 2,
          genderType: 1,
          stats: {},
          emblemPath: "",
          emblemBackgroundPath: "",
        },
        titan: {
          characterId: "titan",
          membershipId: "1",
          membershipType: 3,
          dateLastPlayed: "2025-01-01T00:00:00.000Z",
          minutesPlayedTotal: "200",
          light: 1990,
          classType: 0,
          raceType: 0,
          genderType: 0,
          stats: {},
          emblemPath: "",
          emblemBackgroundPath: "",
        },
      },
    },
    characterEquipment: {
      data: {
        hunter: {
          items: [
            {
              itemHash: 1001,
              itemInstanceId: "h-eq-1",
              quantity: 1,
              bucketHash: BucketHash.Kinetic,
              transferStatus: 0,
              state: 0,
            },
          ],
        },
        titan: {
          items: [
            {
              itemHash: 1001,
              itemInstanceId: "t-eq-1",
              quantity: 1,
              bucketHash: BucketHash.Kinetic,
              transferStatus: 0,
              state: 0,
            },
          ],
        },
      },
    },
    characterInventories: {
      data: {
        hunter: {
          items: [
            {
              itemHash: 1002,
              itemInstanceId: "h-inv-1",
              quantity: 1,
              bucketHash: BucketHash.Energy,
              transferStatus: 0,
              state: 0,
            },
          ],
        },
      },
    },
    profileInventory: {
      data: {
        items: [
          {
            itemHash: 1003,
            itemInstanceId: "v-1",
            quantity: 2,
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
          "h-eq-1": { isEquipped: true },
          "t-eq-1": { isEquipped: true },
        },
      },
    },
  };
}

function itemDef(hash: number) {
  if (hash === 1001) {
    return {
      hash,
      name: "Ace of Spades",
      itemType: 3,
      itemSubType: 1,
      tierTypeName: "Exotic",
      bucketHash: BucketHash.Kinetic,
      classType: -1,
      icon: "",
      maxStackSize: 1,
      nonTransferrable: false,
      equippable: true,
    };
  }
  if (hash === 1002) {
    return {
      hash,
      name: "Fatebringer",
      itemType: 3,
      itemSubType: 2,
      tierTypeName: "Legendary",
      bucketHash: BucketHash.Energy,
      classType: -1,
      icon: "",
      maxStackSize: 1,
      nonTransferrable: false,
      equippable: true,
    };
  }
  if (hash === 1003) {
    return {
      hash,
      name: "Ace in the Vault",
      itemType: 3,
      itemSubType: 1,
      tierTypeName: "Exotic",
      bucketHash: BucketHash.Kinetic,
      classType: -1,
      icon: "",
      maxStackSize: 99,
      nonTransferrable: false,
      equippable: true,
    };
  }
  return null;
}

async function setupInventoryCommandTest() {
  const getProfileMock = mock(async () => makeProfileFixture());
  const ensureManifestMock = mock(async () => {});
  const lookupItemMock = mock((hash: number) => itemDef(hash));
  const withSpinnerMock = mock(
    async (_text: string, fn: () => Promise<unknown>) => fn()
  );

  mock.module("../api/profile.ts", () => ({
    getProfile: getProfileMock,
  }));
  mock.module("../services/manifest-cache.ts", () => ({
    ensureManifest: ensureManifestMock,
    lookupItem: lookupItemMock,
  }));
  mock.module("../ui/spinner.ts", () => ({
    withSpinner: withSpinnerMock,
  }));

  const { registerInventoryCommand } = await import(
    `./inventory.ts?test=${Date.now()}-${Math.random()}`
  );

  return {
    registerInventoryCommand,
    getProfileMock,
    ensureManifestMock,
    cleanup: () => mock.restore(),
  };
}

async function runInventory(
  registerInventoryCommand: (program: Command) => void,
  args: string[]
): Promise<string[]> {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...values: unknown[]) => {
    logs.push(values.map((v) => String(v)).join(" "));
  };

  try {
    const program = new Command();
    registerInventoryCommand(program);
    await program.parseAsync(["node", "destiny", "inventory", ...args]);
  } finally {
    console.log = originalLog;
  }

  return logs;
}

describe("inventory command", () => {
  test("outputs filtered JSON for character + slot + search", async () => {
    const ctx = await setupInventoryCommandTest();
    try {
      const logs = await runInventory(ctx.registerInventoryCommand, [
        "--json",
        "--character",
        "hunter",
        "--slot",
        "kinetic",
        "--search",
        "ace",
      ]);

      expect(logs.length).toBe(1);
      const output = JSON.parse(logs[0]!);

      expect(output).toHaveLength(1);
      expect(output[0]).toMatchObject({
        name: "Ace of Spades",
        location: "Hunter",
        slot: "Kinetic",
        isEquipped: true,
      });

      expect(ctx.ensureManifestMock).toHaveBeenCalled();
      expect(ctx.getProfileMock).toHaveBeenCalledWith([
        DestinyComponentType.Characters,
        DestinyComponentType.CharacterInventories,
        DestinyComponentType.CharacterEquipment,
        DestinyComponentType.ProfileInventories,
        DestinyComponentType.ItemInstances,
      ]);
    } finally {
      ctx.cleanup();
    }
  });

  test("outputs vault-only JSON when --vault is set", async () => {
    const ctx = await setupInventoryCommandTest();
    try {
      const logs = await runInventory(ctx.registerInventoryCommand, [
        "--json",
        "--vault",
      ]);
      const output = JSON.parse(logs[0]!);

      expect(output).toHaveLength(1);
      expect(output[0]).toMatchObject({
        name: "Ace in the Vault",
        location: "Vault",
        quantity: 2,
      });
    } finally {
      ctx.cleanup();
    }
  });
});
