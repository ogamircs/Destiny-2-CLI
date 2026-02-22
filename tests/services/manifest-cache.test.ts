import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { mkdir, rm } from "fs/promises";

type Row = { id: number; json: string };

const itemRows: Row[] = [];
const bucketRows: Row[] = [];
const perkRows: Row[] = [];
const plugSetRows: Row[] = [];
let dbClosed = false;

const fakeManifestDir = "/tmp/d2cli-manifest-test";
const fakeDbPath = `${fakeManifestDir}/manifest.sqlite3`;

mock.module("../../src/services/config.ts", () => ({
  getConfig: () => ({
    apiKey: "api-key",
    clientId: "client-id",
    clientSecret: "client-secret",
    configDir: "/tmp",
    cacheDir: "/tmp",
    tokenPath: "/tmp/tokens.json",
    manifestDir: fakeManifestDir,
  }),
  getLocalPaths: () => ({
    configDir: "/tmp",
    cacheDir: "/tmp",
    tokenPath: "/tmp/tokens.json",
    manifestDir: fakeManifestDir,
  }),
}));

class FakeDatabase {
  query(sql: string) {
    return {
      get: (id: number) => {
        let rows: Row[] = [];
        if (sql.includes("DestinyInventoryItemDefinition")) {
          rows = itemRows;
        } else if (sql.includes("DestinyInventoryBucketDefinition")) {
          rows = bucketRows;
        } else if (sql.includes("DestinySandboxPerkDefinition")) {
          rows = perkRows;
        } else if (sql.includes("DestinyPlugSetDefinition")) {
          rows = plugSetRows;
        }
        const row = rows.find((r) => r.id === id);
        return row ? { json: row.json } : null;
      },
      all: () => {
        if (sql.includes("DestinyInventoryItemDefinition")) {
          return itemRows.map((r) => ({ json: r.json }));
        }
        if (sql.includes("DestinySandboxPerkDefinition")) {
          return perkRows.map((r) => ({ json: r.json }));
        }
        return [];
      },
    };
  }

  close() {
    dbClosed = true;
  }
}

mock.module("bun:sqlite", () => ({
  Database: FakeDatabase,
}));

const {
  closeDb,
  findWeaponsByPerkGroups,
  lookupBucket,
  lookupItem,
  searchPerks,
  searchItems,
} = await import("../../src/services/manifest-cache.ts");

beforeEach(() => {
  itemRows.length = 0;
  bucketRows.length = 0;
  perkRows.length = 0;
  plugSetRows.length = 0;
  dbClosed = false;
  closeDb();
});

beforeAll(async () => {
  await rm(fakeManifestDir, { recursive: true, force: true });
  await mkdir(fakeManifestDir, { recursive: true });
  await Bun.write(fakeDbPath, "");
});

describe("services/manifest-cache lookup helpers", () => {
  test("lookupItem resolves signed hash and maps item fields", () => {
    itemRows.push({
      id: -1,
      json: JSON.stringify({
        hash: 4294967295,
        itemType: 3,
        itemSubType: 6,
        classType: 1,
        equippable: true,
        nonTransferrable: false,
        displayProperties: { name: "Test Weapon", icon: "/icon.png" },
        inventory: {
          tierTypeName: "Exotic",
          bucketTypeHash: 1498876634,
          maxStackSize: 1,
        },
      }),
    });

    const item = lookupItem(4294967295);
    expect(item).not.toBeNull();
    expect(item?.name).toBe("Test Weapon");
    expect(item?.tierTypeName).toBe("Exotic");
    expect(item?.bucketHash).toBe(1498876634);
    expect(item?.equippable).toBe(true);
  });

  test("lookupItem returns null when hash is missing", () => {
    expect(lookupItem(123)).toBeNull();
  });

  test("lookupBucket maps bucket fields", () => {
    bucketRows.push({
      id: 10,
      json: JSON.stringify({
        hash: 10,
        category: 1,
        displayProperties: { name: "Kinetic Weapons" },
      }),
    });

    const bucket = lookupBucket(10);
    expect(bucket).toEqual({
      hash: 10,
      name: "Kinetic Weapons",
      category: 1,
    });
  });

  test("searchItems filters by case-insensitive name and itemType", () => {
    itemRows.push(
      {
        id: 1,
        json: JSON.stringify({
          hash: 1,
          itemType: 3,
          itemSubType: 0,
          displayProperties: { name: "Ace of Spades", icon: "" },
          inventory: {
            tierTypeName: "Exotic",
            bucketTypeHash: 1,
            maxStackSize: 1,
          },
        }),
      },
      {
        id: 2,
        json: JSON.stringify({
          hash: 2,
          itemType: 0,
          displayProperties: { name: "System Item", icon: "" },
          inventory: { tierTypeName: "Common", bucketTypeHash: 1 },
        }),
      }
    );

    const results = searchItems("ace");
    expect(results.length).toBe(1);
    expect(results[0]?.name).toBe("Ace of Spades");
  });

  test("searchPerks filters perks by case-insensitive name", () => {
    perkRows.push(
      {
        id: 10,
        json: JSON.stringify({
          hash: 10,
          displayProperties: { name: "Outlaw", description: "Reload speed boost" },
        }),
      },
      {
        id: 11,
        json: JSON.stringify({
          hash: 11,
          displayProperties: { name: "Rampage", description: "Damage bonus" },
        }),
      }
    );

    const results = searchPerks("out");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Outlaw");
  });

  test("findWeaponsByPerkGroups finds weapons that can roll all requested perks", () => {
    itemRows.push(
      {
        id: 100,
        json: JSON.stringify({
          hash: 100,
          itemType: 3,
          itemTypeDisplayName: "Hand Cannon",
          displayProperties: { name: "Palindrome", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [
              { randomizedPlugSetHash: 500 },
              { randomizedPlugSetHash: 502 },
            ],
          },
        }),
      },
      {
        id: 101,
        json: JSON.stringify({
          hash: 101,
          itemType: 3,
          itemTypeDisplayName: "Scout Rifle",
          displayProperties: { name: "Hung Jury SR4", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [{ randomizedPlugSetHash: 501 }],
          },
        }),
      },
      {
        id: 10001,
        json: JSON.stringify({
          hash: 10001,
          displayProperties: { name: "Outlaw", icon: "" },
          perks: [{ perkHash: 9001 }],
        }),
      },
      {
        id: 10002,
        json: JSON.stringify({
          hash: 10002,
          displayProperties: { name: "Rampage", icon: "" },
          perks: [{ perkHash: 9002 }],
        }),
      },
      {
        id: 10003,
        json: JSON.stringify({
          hash: 10003,
          displayProperties: { name: "Explosive Payload", icon: "" },
          perks: [{ perkHash: 9003 }],
        }),
      }
    );

    plugSetRows.push(
      {
        id: 500,
        json: JSON.stringify({
          hash: 500,
          reusablePlugItems: [{ plugItemHash: 10001 }],
        }),
      },
      {
        id: 502,
        json: JSON.stringify({
          hash: 502,
          reusablePlugItems: [{ plugItemHash: 10002 }],
        }),
      },
      {
        id: 501,
        json: JSON.stringify({
          hash: 501,
          reusablePlugItems: [{ plugItemHash: 10003 }],
        }),
      }
    );

    const results = findWeaponsByPerkGroups([[9001], [9002]], "hand");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Palindrome");
    expect(results[0]?.archetype).toBe("Hand Cannon");
    expect(results[0]?.perkHashes).toEqual(expect.arrayContaining([9001, 9002]));
  });

  test("findWeaponsByPerkGroups supports alternative perks in each required group", () => {
    itemRows.push(
      {
        id: 200,
        json: JSON.stringify({
          hash: 200,
          itemType: 3,
          itemTypeDisplayName: "Auto Rifle",
          displayProperties: { name: "Prosecutor", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [
              { randomizedPlugSetHash: 600 },
              { randomizedPlugSetHash: 602 },
            ],
          },
        }),
      },
      {
        id: 201,
        json: JSON.stringify({
          hash: 201,
          itemType: 3,
          itemTypeDisplayName: "Auto Rifle",
          displayProperties: { name: "Origin Story", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [{ randomizedPlugSetHash: 601 }],
          },
        }),
      },
      {
        id: 20001,
        json: JSON.stringify({
          hash: 20001,
          displayProperties: { name: "Perk A2", icon: "" },
          perks: [{ perkHash: 9102 }],
        }),
      },
      {
        id: 20002,
        json: JSON.stringify({
          hash: 20002,
          displayProperties: { name: "Perk B1", icon: "" },
          perks: [{ perkHash: 9201 }],
        }),
      },
      {
        id: 20003,
        json: JSON.stringify({
          hash: 20003,
          displayProperties: { name: "Perk A1", icon: "" },
          perks: [{ perkHash: 9101 }],
        }),
      }
    );

    plugSetRows.push(
      {
        id: 600,
        json: JSON.stringify({
          hash: 600,
          reusablePlugItems: [{ plugItemHash: 20001 }],
        }),
      },
      {
        id: 602,
        json: JSON.stringify({
          hash: 602,
          reusablePlugItems: [{ plugItemHash: 20002 }],
        }),
      },
      {
        id: 601,
        json: JSON.stringify({
          hash: 601,
          reusablePlugItems: [{ plugItemHash: 20003 }],
        }),
      }
    );

    const results = findWeaponsByPerkGroups([[9101, 9102], [9201, 9202]]);
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Prosecutor");
    expect(results[0]?.perkHashes).toEqual(expect.arrayContaining([9102, 9201]));
  });

  test("findWeaponsByPerkGroups filters archetypes with trim + case-insensitive matching", () => {
    itemRows.push(
      {
        id: 300,
        json: JSON.stringify({
          hash: 300,
          itemType: 3,
          itemTypeDisplayName: "Hand Cannon",
          displayProperties: { name: "Palindrome", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [{ randomizedPlugSetHash: 700 }],
          },
        }),
      },
      {
        id: 301,
        json: JSON.stringify({
          hash: 301,
          itemType: 3,
          itemTypeDisplayName: "Pulse Rifle",
          displayProperties: { name: "The Messenger", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [{ randomizedPlugSetHash: 701 }],
          },
        }),
      },
      {
        id: 30001,
        json: JSON.stringify({
          hash: 30001,
          displayProperties: { name: "Keep Away", icon: "" },
          perks: [{ perkHash: 9301 }],
        }),
      }
    );

    plugSetRows.push(
      {
        id: 700,
        json: JSON.stringify({
          hash: 700,
          reusablePlugItems: [{ plugItemHash: 30001 }],
        }),
      },
      {
        id: 701,
        json: JSON.stringify({
          hash: 701,
          reusablePlugItems: [{ plugItemHash: 30001 }],
        }),
      }
    );

    const allResults = findWeaponsByPerkGroups([[9301]]);
    expect(allResults).toHaveLength(2);

    const filteredResults = findWeaponsByPerkGroups([[9301]], "  HAND  ");
    expect(filteredResults).toHaveLength(1);
    expect(filteredResults[0]?.name).toBe("Palindrome");
    expect(filteredResults[0]?.archetype).toBe("Hand Cannon");
  });

  test("findWeaponsByPerkGroups requires requested perk groups across distinct sockets", () => {
    itemRows.push(
      {
        id: 400,
        json: JSON.stringify({
          hash: 400,
          itemType: 3,
          itemTypeDisplayName: "Hand Cannon",
          displayProperties: { name: "Single Column Gun", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [{ randomizedPlugSetHash: 800 }],
          },
        }),
      },
      {
        id: 401,
        json: JSON.stringify({
          hash: 401,
          itemType: 3,
          itemTypeDisplayName: "Hand Cannon",
          displayProperties: { name: "Split Column Gun", icon: "" },
          inventory: { tierTypeName: "Legendary", bucketTypeHash: 1498876634 },
          sockets: {
            socketEntries: [
              { randomizedPlugSetHash: 801 },
              { randomizedPlugSetHash: 802 },
            ],
          },
        }),
      },
      {
        id: 40001,
        json: JSON.stringify({
          hash: 40001,
          displayProperties: { name: "Perk A", icon: "" },
          perks: [{ perkHash: 9401 }],
        }),
      },
      {
        id: 40002,
        json: JSON.stringify({
          hash: 40002,
          displayProperties: { name: "Perk B", icon: "" },
          perks: [{ perkHash: 9402 }],
        }),
      }
    );

    plugSetRows.push(
      {
        id: 800,
        json: JSON.stringify({
          hash: 800,
          reusablePlugItems: [
            { plugItemHash: 40001 },
            { plugItemHash: 40002 },
          ],
        }),
      },
      {
        id: 801,
        json: JSON.stringify({
          hash: 801,
          reusablePlugItems: [{ plugItemHash: 40001 }],
        }),
      },
      {
        id: 802,
        json: JSON.stringify({
          hash: 802,
          reusablePlugItems: [{ plugItemHash: 40002 }],
        }),
      }
    );

    const results = findWeaponsByPerkGroups([[9401], [9402]], "hand");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Split Column Gun");
  });

  test("closeDb closes current database instance", () => {
    itemRows.push({
      id: 1,
      json: JSON.stringify({
        hash: 1,
        itemType: 3,
        displayProperties: { name: "Any", icon: "" },
        inventory: { tierTypeName: "Rare", bucketTypeHash: 1 },
      }),
    });
    lookupItem(1);
    closeDb();
    expect(dbClosed).toBe(true);
  });
});

afterAll(async () => {
  await rm(fakeManifestDir, { recursive: true, force: true });
  mock.restore();
});
