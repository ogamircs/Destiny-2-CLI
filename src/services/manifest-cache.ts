import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join } from "path";
import { mkdir } from "fs/promises";
import { getLocalPaths } from "./config.ts";
import { getManifestInfo, getManifestDbUrl } from "../api/manifest.ts";
import { ManifestError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

let db: Database | null = null;
const VERSION_FILE = "manifest-version.txt";

export interface ManifestItem {
  hash: number;
  name: string;
  itemType: number;
  itemSubType: number;
  tierTypeName: string;
  bucketHash: number;
  classType: number;
  icon: string;
  maxStackSize: number;
  nonTransferrable: boolean;
  equippable: boolean;
}

export interface ManifestBucket {
  hash: number;
  name: string;
  category: number;
}

export interface ManifestPerk {
  hash: number;
  name: string;
  description: string;
}

export interface WeaponPerkPool {
  hash: number;
  name: string;
  archetype: string;
  tierTypeName: string;
  perkHashes: number[];
}

type ManifestJsonRow = { json: string };
type SocketEntry = {
  randomizedPlugSetHash?: number;
  reusablePlugSetHash?: number;
};

let plugSetCache = new Map<number, number[]>();
let plugPerkCache = new Map<number, number[]>();

function toSignedHash(hash: number): number {
  return hash > 0x7fffffff ? hash - 0x100000000 : hash;
}

function getDbPath(): string {
  return join(getLocalPaths().manifestDir, "manifest.sqlite3");
}

function getVersionPath(): string {
  return join(getLocalPaths().manifestDir, VERSION_FILE);
}

async function getCurrentVersion(): Promise<string | null> {
  const versionPath = getVersionPath();
  if (!existsSync(versionPath)) return null;
  return (await Bun.file(versionPath).text()).trim();
}

export async function needsUpdate(): Promise<boolean> {
  const currentVersion = await getCurrentVersion();
  if (!currentVersion) return true;
  if (!existsSync(getDbPath())) return true;

  try {
    const manifest = await getManifestInfo();
    return manifest.version !== currentVersion;
  } catch {
    // If we can't check, use cached version
    return false;
  }
}

export async function updateManifest(): Promise<void> {
  const config = getLocalPaths();
  await mkdir(config.manifestDir, { recursive: true });

  const manifest = await getManifestInfo();
  const dbUrl = getManifestDbUrl(manifest);

  debug(`Downloading manifest DB from ${dbUrl}`);
  const res = await fetch(dbUrl);
  if (!res.ok) {
    throw new ManifestError(`Failed to download manifest: ${res.status}`);
  }

  // Bungie serves a zip file containing the SQLite DB
  const zipData = await res.arrayBuffer();

  // The response is actually a zip; we need to extract it
  // Bun doesn't have built-in zip support, so we'll use a temp file + unzip command
  const zipPath = join(config.manifestDir, "manifest.zip");
  await Bun.write(zipPath, zipData);

  const dbPath = getDbPath();
  // Extract — the zip contains a single .content file
  const proc = Bun.spawn(
    ["unzip", "-o", "-j", zipPath, "-d", config.manifestDir],
    { stdout: "pipe", stderr: "pipe" }
  );
  await proc.exited;

  // Find the extracted .content file and rename it
  const { stdout } = Bun.spawn(["ls", config.manifestDir], {
    stdout: "pipe",
  });
  const files = (await new Response(stdout).text()).split("\n");
  const contentFile = files.find((f) => f.endsWith(".content"));
  if (contentFile) {
    const contentPath = join(config.manifestDir, contentFile);
    if (contentPath !== dbPath) {
      Bun.spawn(["mv", contentPath, dbPath]);
    }
  }

  // Clean up zip
  Bun.spawn(["rm", "-f", zipPath]);

  // Save version
  await Bun.write(getVersionPath(), manifest.version);
  debug(`Manifest updated to version ${manifest.version}`);
}

function getDb(): Database {
  if (db) return db;
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) {
    throw new ManifestError(
      "Manifest not downloaded. This will happen automatically on first use."
    );
  }
  db = new Database(dbPath, { readonly: true });
  return db;
}

export async function ensureManifest(): Promise<void> {
  if (await needsUpdate()) {
    await updateManifest();
  }
}

export function lookupItem(hash: number): ManifestItem | null {
  const database = getDb();
  // Bungie uses unsigned 32-bit hashes but stores them as signed in SQLite
  const signedHash = toSignedHash(hash);

  const row = database
    .query("SELECT json FROM DestinyInventoryItemDefinition WHERE id = ?")
    .get(signedHash) as ManifestJsonRow | null;

  if (!row) {
    debug(`Item not found in manifest: ${hash}`);
    return null;
  }

  const data = JSON.parse(row.json);
  return {
    hash: data.hash,
    name: data.displayProperties?.name || "Unknown",
    itemType: data.itemType || 0,
    itemSubType: data.itemSubType || 0,
    tierTypeName: data.inventory?.tierTypeName || "Common",
    bucketHash: data.inventory?.bucketTypeHash || 0,
    classType: data.classType ?? -1,
    icon: data.displayProperties?.icon || "",
    maxStackSize: data.inventory?.maxStackSize || 1,
    nonTransferrable: data.nonTransferrable || false,
    equippable: data.equippable || false,
  };
}

export function lookupBucket(hash: number): ManifestBucket | null {
  const database = getDb();
  const signedHash = toSignedHash(hash);

  const row = database
    .query(
      "SELECT json FROM DestinyInventoryBucketDefinition WHERE id = ?"
    )
    .get(signedHash) as ManifestJsonRow | null;

  if (!row) return null;

  const data = JSON.parse(row.json);
  return {
    hash: data.hash,
    name: data.displayProperties?.name || "Unknown",
    category: data.category || 0,
  };
}

export function lookupPerk(hash: number): ManifestPerk | null {
  const database = getDb();
  const signedHash = toSignedHash(hash);

  const row = database
    .query("SELECT json FROM DestinySandboxPerkDefinition WHERE id = ?")
    .get(signedHash) as ManifestJsonRow | null;

  if (!row) return null;

  const data = JSON.parse(row.json);
  return {
    hash: data.hash,
    name: data.displayProperties?.name || "Unknown Perk",
    description: data.displayProperties?.description || "",
  };
}

export function searchItems(query: string): ManifestItem[] {
  const database = getDb();
  const rows = database
    .query("SELECT json FROM DestinyInventoryItemDefinition")
    .all() as ManifestJsonRow[];

  const lowerQuery = query.toLowerCase();
  const results: ManifestItem[] = [];

  for (const row of rows) {
    const data = JSON.parse(row.json);
    const name = (data.displayProperties?.name || "").toLowerCase();
    if (name.includes(lowerQuery) && data.itemType !== 0) {
      results.push({
        hash: data.hash,
        name: data.displayProperties?.name || "Unknown",
        itemType: data.itemType || 0,
        itemSubType: data.itemSubType || 0,
        tierTypeName: data.inventory?.tierTypeName || "Common",
        bucketHash: data.inventory?.bucketTypeHash || 0,
        classType: data.classType ?? -1,
        icon: data.displayProperties?.icon || "",
        maxStackSize: data.inventory?.maxStackSize || 1,
        nonTransferrable: data.nonTransferrable || false,
        equippable: data.equippable || false,
      });
    }
  }

  return results;
}

export function searchPerks(query: string): ManifestPerk[] {
  const database = getDb();
  const rows = database
    .query("SELECT json FROM DestinySandboxPerkDefinition")
    .all() as ManifestJsonRow[];

  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) {
    return [];
  }

  const results: ManifestPerk[] = [];

  for (const row of rows) {
    const data = JSON.parse(row.json);
    const name = (data.displayProperties?.name || "").trim();
    if (!name) continue;
    if (!name.toLowerCase().includes(lowerQuery)) continue;

    results.push({
      hash: data.hash,
      name,
      description: data.displayProperties?.description || "",
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

function getPlugSetPlugItemHashes(plugSetHash: number): number[] {
  const cached = plugSetCache.get(plugSetHash);
  if (cached) return cached;

  const database = getDb();
  const row = database
    .query("SELECT json FROM DestinyPlugSetDefinition WHERE id = ?")
    .get(toSignedHash(plugSetHash)) as ManifestJsonRow | null;

  if (!row) {
    plugSetCache.set(plugSetHash, []);
    return [];
  }

  const data = JSON.parse(row.json);
  const reusablePlugItems = (data.reusablePlugItems ?? []) as Array<{
    plugItemHash?: number;
  }>;

  const plugItemHashes = reusablePlugItems
    .map((entry) => entry.plugItemHash)
    .filter((hash): hash is number => typeof hash === "number" && hash > 0);

  plugSetCache.set(plugSetHash, plugItemHashes);
  return plugItemHashes;
}

function getPlugPerkHashes(plugItemHash: number): number[] {
  const cached = plugPerkCache.get(plugItemHash);
  if (cached) return cached;

  const database = getDb();
  const row = database
    .query("SELECT json FROM DestinyInventoryItemDefinition WHERE id = ?")
    .get(toSignedHash(plugItemHash)) as ManifestJsonRow | null;

  if (!row) {
    plugPerkCache.set(plugItemHash, []);
    return [];
  }

  const data = JSON.parse(row.json);
  const perks = (data.perks ?? []) as Array<{ perkHash?: number }>;

  const perkHashes = perks
    .map((perk) => perk.perkHash)
    .filter((hash): hash is number => typeof hash === "number" && hash > 0);

  plugPerkCache.set(plugItemHash, perkHashes);
  return perkHashes;
}

function matchesPerkGroupsAcrossDistinctSockets(
  perkGroups: number[][],
  socketPerkColumns: Set<number>[]
): boolean {
  if (perkGroups.length > socketPerkColumns.length) {
    return false;
  }

  const matchingColumnsByGroup = perkGroups.map((group) => {
    if (group.length === 0) {
      return [];
    }

    const matches: number[] = [];
    for (let socketIndex = 0; socketIndex < socketPerkColumns.length; socketIndex++) {
      const column = socketPerkColumns[socketIndex]!;
      if (group.some((hash) => column.has(hash))) {
        matches.push(socketIndex);
      }
    }
    return matches;
  });

  if (matchingColumnsByGroup.some((matches) => matches.length === 0)) {
    return false;
  }

  // Assign the most-constrained groups first to avoid unnecessary branching.
  const groupOrder = matchingColumnsByGroup
    .map((_, index) => index)
    .sort(
      (a, b) =>
        matchingColumnsByGroup[a]!.length - matchingColumnsByGroup[b]!.length
    );

  const usedSockets = new Set<number>();

  function assignGroup(groupOrderIndex: number): boolean {
    if (groupOrderIndex >= groupOrder.length) {
      return true;
    }

    const groupIndex = groupOrder[groupOrderIndex]!;
    const matchingSockets = matchingColumnsByGroup[groupIndex]!;

    for (const socketIndex of matchingSockets) {
      if (usedSockets.has(socketIndex)) {
        continue;
      }
      usedSockets.add(socketIndex);
      if (assignGroup(groupOrderIndex + 1)) {
        return true;
      }
      usedSockets.delete(socketIndex);
    }

    return false;
  }

  return assignGroup(0);
}

export function findWeaponsByPerkGroups(
  perkGroups: number[][],
  archetypeQuery?: string
): WeaponPerkPool[] {
  if (perkGroups.length === 0) return [];

  const database = getDb();
  const rows = database
    .query("SELECT json FROM DestinyInventoryItemDefinition")
    .all() as ManifestJsonRow[];

  const archetypeLower = archetypeQuery?.toLowerCase().trim();
  const results: WeaponPerkPool[] = [];

  for (const row of rows) {
    const data = JSON.parse(row.json);
    if (data.itemType !== 3) continue;

    const name = (data.displayProperties?.name || "").trim();
    if (!name) continue;

    const archetype = (
      data.itemTypeDisplayName ||
      data.itemTypeAndTierDisplayName ||
      "Unknown"
    ).trim();

    if (archetypeLower && !archetype.toLowerCase().includes(archetypeLower)) {
      continue;
    }

    const socketEntries = (data.sockets?.socketEntries ?? []) as SocketEntry[];
    if (socketEntries.length === 0) continue;

    const weaponPerks = new Set<number>();
    const socketPerkColumns: Set<number>[] = [];

    for (const socketEntry of socketEntries) {
      const socketPerks = new Set<number>();
      const plugSetHashes = [
        socketEntry.randomizedPlugSetHash,
        socketEntry.reusablePlugSetHash,
      ];

      for (const plugSetHash of plugSetHashes) {
        if (typeof plugSetHash !== "number" || plugSetHash <= 0) continue;
        const plugItemHashes = getPlugSetPlugItemHashes(plugSetHash);
        for (const plugItemHash of plugItemHashes) {
          for (const perkHash of getPlugPerkHashes(plugItemHash)) {
            weaponPerks.add(perkHash);
            socketPerks.add(perkHash);
          }
        }
      }

      if (socketPerks.size > 0) {
        socketPerkColumns.push(socketPerks);
      }
    }

    if (weaponPerks.size === 0 || socketPerkColumns.length === 0) continue;
    if (!matchesPerkGroupsAcrossDistinctSockets(perkGroups, socketPerkColumns)) {
      continue;
    }

    results.push({
      hash: data.hash,
      name,
      archetype,
      tierTypeName: data.inventory?.tierTypeName || "Common",
      perkHashes: Array.from(weaponPerks),
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
  plugSetCache = new Map<number, number[]>();
  plugPerkCache = new Map<number, number[]>();
}
