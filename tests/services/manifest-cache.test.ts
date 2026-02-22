import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";
import { mkdir, rm } from "fs/promises";

type Row = { id: number; json: string };

const itemRows: Row[] = [];
const bucketRows: Row[] = [];
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
        const rows = sql.includes("DestinyInventoryItemDefinition")
          ? itemRows
          : bucketRows;
        const row = rows.find((r) => r.id === id);
        return row ? { json: row.json } : null;
      },
      all: () => {
        if (sql.includes("DestinyInventoryItemDefinition")) {
          return itemRows.map((r) => ({ json: r.json }));
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
  lookupBucket,
  lookupItem,
  searchItems,
} = await import("../../src/services/manifest-cache.ts");

beforeEach(() => {
  itemRows.length = 0;
  bucketRows.length = 0;
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
