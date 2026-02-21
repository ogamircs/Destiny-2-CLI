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
  const signedHash = hash > 0x7fffffff ? hash - 0x100000000 : hash;

  const row = database
    .query("SELECT json FROM DestinyInventoryItemDefinition WHERE id = ?")
    .get(signedHash) as { json: string } | null;

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
  const signedHash = hash > 0x7fffffff ? hash - 0x100000000 : hash;

  const row = database
    .query(
      "SELECT json FROM DestinyInventoryBucketDefinition WHERE id = ?"
    )
    .get(signedHash) as { json: string } | null;

  if (!row) return null;

  const data = JSON.parse(row.json);
  return {
    hash: data.hash,
    name: data.displayProperties?.name || "Unknown",
    category: data.category || 0,
  };
}

export function searchItems(query: string): ManifestItem[] {
  const database = getDb();
  const rows = database
    .query("SELECT json FROM DestinyInventoryItemDefinition")
    .all() as { json: string }[];

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

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
