import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join } from "path";
import { mkdir, readdir, rename, rm } from "fs/promises";
import { getLocalPaths } from "./config.ts";
import { getManifestInfo, getManifestDbUrl } from "../api/manifest.ts";
import { getD1ManifestInfo } from "../api/d1/endpoints.ts";
import { getGame, type GameId } from "../games/context.ts";
import { ManifestError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

let db: Database | null = null;
let openGame: GameId | null = null;
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

function manifestRoot(): string {
  const root = getLocalPaths().manifestDir;
  return getGame() === "d1" ? join(root, "d1") : root;
}

function getDbPath(): string {
  return join(manifestRoot(), "manifest.sqlite3");
}

function getVersionPath(): string {
  return join(manifestRoot(), VERSION_FILE);
}

async function loadManifestInfo() {
  return getGame() === "d1" ? getD1ManifestInfo() : getManifestInfo();
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
    const manifest = await loadManifestInfo();
    return manifest.version !== currentVersion;
  } catch {
    // If we can't check, use cached version
    return false;
  }
}

export async function updateManifest(): Promise<void> {
  const directory = manifestRoot();
  await mkdir(directory, { recursive: true });

  const manifest = await loadManifestInfo();
  const dbUrl = getManifestDbUrl(manifest);

  debug(`Downloading manifest DB from ${dbUrl}`);
  const res = await fetch(dbUrl);
  if (!res.ok) {
    throw new ManifestError(`Failed to download manifest: ${res.status}`);
  }

  // Bungie serves a zip file containing the SQLite DB.
  // Bun has no built-in unzip, so extract with the system unzip command.
  const zipData = await res.arrayBuffer();
  const zipPath = join(directory, "manifest.zip");
  await Bun.write(zipPath, zipData);

  try {
    await extractManifestZip(zipPath, directory, getDbPath());
  } finally {
    await rm(zipPath, { force: true });
  }

  // Close any handle opened against the previous file before readers reopen it.
  closeDb();
  await Bun.write(getVersionPath(), manifest.version);
  debug(`Manifest updated to version ${manifest.version}`);
}

async function extractManifestZip(
  zipPath: string,
  manifestDir: string,
  dbPath: string
): Promise<void> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(["unzip", "-o", "-j", zipPath, "-d", manifestDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (err) {
    throw new ManifestError(
      `The unzip command is required to install the Destiny manifest (${err instanceof Error ? err.message : String(err)}).`
    );
  }

  const exitCode = await proc.exited;
  const stderrPipe = proc.stderr;
  const stderr =
    stderrPipe && typeof stderrPipe !== "number"
      ? (await new Response(stderrPipe).text()).trim()
      : "";
  if (exitCode !== 0) {
    throw new ManifestError(
      `Failed to extract manifest (unzip exit ${exitCode})${stderr ? `: ${stderr}` : ""}`
    );
  }

  const files = await readdir(manifestDir);
  const contentFile = files.find((file) => file.endsWith(".content"));
  if (!contentFile) {
    throw new ManifestError("Manifest zip did not contain a .content database");
  }

  const contentPath = join(manifestDir, contentFile);
  if (contentPath !== dbPath) {
    await rename(contentPath, dbPath);
  }
}

function getDb(): Database {
  const game = getGame();
  if (db && openGame === game) return db;
  if (db) {
    db.close();
    db = null;
    plugSetCache = new Map();
    plugPerkCache = new Map();
  }
  const dbPath = getDbPath();
  if (!existsSync(dbPath)) {
    throw new ManifestError(
      "Manifest not downloaded. This will happen automatically on first use."
    );
  }
  db = new Database(dbPath, { readonly: true });
  openGame = game;
  return db;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function recordField(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readManifestItem(
  data: Record<string, unknown>,
  game: GameId = getGame()
): ManifestItem {
  const display = recordField(data.displayProperties);
  const inventory = recordField(data.inventory);
  const classType = numberField(data.classType) ?? -1;
  return {
    hash: numberField(data.hash) ?? numberField(data.itemHash) ?? 0,
    name: stringField(display?.name) || stringField(data.itemName) || "Unknown",
    itemType: numberField(data.itemType) ?? 0,
    itemSubType: numberField(data.itemSubType) ?? 0,
    tierTypeName:
      stringField(inventory?.tierTypeName) || stringField(data.tierTypeName) || "Common",
    bucketHash: numberField(inventory?.bucketTypeHash) ?? numberField(data.bucketTypeHash) ?? 0,
    classType: game === "d1" && classType === 3 ? -1 : classType,
    icon: stringField(display?.icon) || stringField(data.icon),
    maxStackSize: numberField(inventory?.maxStackSize) ?? numberField(data.maxStackSize) ?? 1,
    nonTransferrable: data.nonTransferrable === true,
    equippable: data.equippable === true,
  };
}

const MANIFEST_NAME_TABLES = new Set([
  "DestinyProgressionDefinition",
  "DestinyRecordBookDefinition",
  "DestinyInventoryItemDefinition",
  "DestinyVendorDefinition",
]);

export function lookupManifestName(table: string, hash: number): string | null {
  if (!MANIFEST_NAME_TABLES.has(table)) {
    throw new Error(`Refusing to query unexpected manifest table ${table}`);
  }
  try {
    const database = getDb();
    const row = database
      .query(`SELECT json FROM ${table} WHERE id = ?`)
      .get(toSignedHash(hash)) as ManifestJsonRow | null;
    if (!row) return null;
    const data = JSON.parse(row.json) as Record<string, unknown>;
    const display = recordField(data.displayProperties);
    const summary = recordField(data.summary);
    const name =
      stringField(display?.name) ||
      stringField(data.name) ||
      stringField(data.displayName) ||
      stringField(summary?.vendorName);
    return name.trim() ? name : null;
  } catch {
    return null;
  }
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

  return readManifestItem(JSON.parse(row.json) as Record<string, unknown>);
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

  const data = JSON.parse(row.json) as Record<string, unknown>;
  const display = recordField(data.displayProperties);
  return {
    hash: numberField(data.hash) ?? numberField(data.bucketHash) ?? hash,
    name: stringField(display?.name) || stringField(data.bucketName) || "Unknown",
    category: numberField(data.category) ?? 0,
  };
}

export function lookupPerk(hash: number): ManifestPerk | null {
  const database = getDb();
  const signedHash = toSignedHash(hash);

  const row = database
    .query("SELECT json FROM DestinySandboxPerkDefinition WHERE id = ?")
    .get(signedHash) as ManifestJsonRow | null;

  if (!row) return null;

  const data = JSON.parse(row.json) as Record<string, unknown>;
  const display = recordField(data.displayProperties);
  return {
    hash: numberField(data.hash) ?? numberField(data.perkHash) ?? hash,
    name:
      stringField(display?.name) ||
      stringField(data.perkName) ||
      stringField(data.displayName) ||
      "Unknown Perk",
    description:
      stringField(display?.description) ||
      stringField(data.perkDescription) ||
      stringField(data.displayDescription),
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
    const item = readManifestItem(JSON.parse(row.json) as Record<string, unknown>);
    if (item.name.toLowerCase().includes(lowerQuery) && item.itemType !== 0) {
      results.push(item);
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
    const data = JSON.parse(row.json) as Record<string, unknown>;
    const display = recordField(data.displayProperties);
    const name = (
      stringField(display?.name) ||
      stringField(data.perkName) ||
      stringField(data.displayName)
    ).trim();
    if (!name) continue;
    if (!name.toLowerCase().includes(lowerQuery)) continue;

    results.push({
      hash: numberField(data.hash) ?? numberField(data.perkHash) ?? 0,
      name,
      description:
        stringField(display?.description) ||
        stringField(data.perkDescription) ||
        stringField(data.displayDescription),
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
  openGame = null;
  plugSetCache = new Map<number, number[]>();
  plugPerkCache = new Map<number, number[]>();
}
