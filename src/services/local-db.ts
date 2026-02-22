import { Database } from "bun:sqlite";
import { existsSync } from "fs";
import { join } from "path";
import { mkdirSync } from "fs";
import { getLocalPaths } from "./config.ts";
import { debug } from "../utils/logger.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoadoutItem {
  hash: number;
  instanceId: string | undefined;
  bucketHash: number;
  isEquipped: boolean;
}

export interface Loadout {
  name: string;
  classType: number;
  items: LoadoutItem[];
  createdAt: number;
  updatedAt: number;
}

export interface SavedSearch {
  name: string;
  query: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Schema migrations
// ---------------------------------------------------------------------------

const MIGRATIONS: string[] = [
  // Migration 0
  `
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version (version) VALUES (0);

CREATE TABLE IF NOT EXISTS item_tags (
  item_key   TEXT    NOT NULL,
  tag        TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (item_key, tag)
);

CREATE TABLE IF NOT EXISTS item_notes (
  item_key   TEXT    NOT NULL PRIMARY KEY,
  note       TEXT    NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS loadouts (
  name        TEXT    NOT NULL PRIMARY KEY,
  class_type  INTEGER NOT NULL,
  items_json  TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS saved_searches (
  name       TEXT    NOT NULL PRIMARY KEY,
  query      TEXT    NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
  `.trim(),
];

function runMigrations(database: Database): void {
  // Check if schema_version table exists
  const tableExists = database
    .query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'`
    )
    .get() as { name: string } | null;

  let currentVersion = -1;
  if (tableExists) {
    const row = database
      .query("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1")
      .get() as { version: number } | null;
    currentVersion = row?.version ?? -1;
  }

  // Run any unapplied migrations
  for (let i = currentVersion + 1; i < MIGRATIONS.length; i++) {
    debug(`Running local-db migration ${i}`);
    database.exec(MIGRATIONS[i]!);
    if (i > 0) {
      // Update version (migration 0 inserts it as part of the SQL)
      database
        .query("UPDATE schema_version SET version = ?")
        .run(i);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _db: Database | null = null;

function getDbPath(): string {
  return join(getLocalPaths().configDir, "local.db");
}

export function openLocalDb(): Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  const dir = join(dbPath, "..");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  debug(`Opening local DB at ${dbPath}`);
  _db = new Database(dbPath);
  runMigrations(_db);
  return _db;
}

export function closeLocalDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ---------------------------------------------------------------------------
// Item key
// ---------------------------------------------------------------------------

export function itemKey(item: {
  instanceId: string | undefined;
  hash: number;
}): string {
  return item.instanceId ?? `hash:${item.hash}`;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export function addTag(
  item: { instanceId: string | undefined; hash: number },
  tag: string
): void {
  const db = openLocalDb();
  db.query(
    "INSERT OR IGNORE INTO item_tags (item_key, tag) VALUES (?, ?)"
  ).run(itemKey(item), tag);
}

export function removeTag(
  item: { instanceId: string | undefined; hash: number },
  tag: string
): void {
  const db = openLocalDb();
  db.query(
    "DELETE FROM item_tags WHERE item_key = ? AND tag = ?"
  ).run(itemKey(item), tag);
}

export function getTags(item: {
  instanceId: string | undefined;
  hash: number;
}): string[] {
  const db = openLocalDb();
  const rows = db
    .query("SELECT tag FROM item_tags WHERE item_key = ? ORDER BY created_at")
    .all(itemKey(item)) as { tag: string }[];
  return rows.map((r) => r.tag);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export function setNote(
  item: { instanceId: string | undefined; hash: number },
  note: string
): void {
  const db = openLocalDb();
  db.query(
    `INSERT OR REPLACE INTO item_notes (item_key, note, updated_at)
     VALUES (?, ?, unixepoch())`
  ).run(itemKey(item), note);
}

export function clearNote(item: {
  instanceId: string | undefined;
  hash: number;
}): void {
  const db = openLocalDb();
  db.query("DELETE FROM item_notes WHERE item_key = ?").run(itemKey(item));
}

export function getNote(item: {
  instanceId: string | undefined;
  hash: number;
}): string | null {
  const db = openLocalDb();
  const row = db
    .query("SELECT note FROM item_notes WHERE item_key = ?")
    .get(itemKey(item)) as { note: string } | null;
  return row?.note ?? null;
}

// ---------------------------------------------------------------------------
// Loadouts
// ---------------------------------------------------------------------------

export function saveLoadout(loadout: Loadout): void {
  const db = openLocalDb();
  const existing = db
    .query("SELECT created_at FROM loadouts WHERE name = ?")
    .get(loadout.name) as { created_at: number } | null;

  const createdAt = existing?.created_at ?? loadout.createdAt;

  db.query(
    `INSERT OR REPLACE INTO loadouts (name, class_type, items_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, unixepoch())`
  ).run(
    loadout.name,
    loadout.classType,
    JSON.stringify(loadout.items),
    createdAt
  );
}

export function getLoadout(name: string): Loadout | null {
  const db = openLocalDb();
  const row = db
    .query(
      "SELECT name, class_type, items_json, created_at, updated_at FROM loadouts WHERE name = ?"
    )
    .get(name) as {
    name: string;
    class_type: number;
    items_json: string;
    created_at: number;
    updated_at: number;
  } | null;

  if (!row) return null;

  return {
    name: row.name,
    classType: row.class_type,
    items: JSON.parse(row.items_json) as LoadoutItem[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listLoadouts(): Loadout[] {
  const db = openLocalDb();
  const rows = db
    .query(
      "SELECT name, class_type, items_json, created_at, updated_at FROM loadouts ORDER BY name"
    )
    .all() as {
    name: string;
    class_type: number;
    items_json: string;
    created_at: number;
    updated_at: number;
  }[];

  return rows.map((row) => ({
    name: row.name,
    classType: row.class_type,
    items: JSON.parse(row.items_json) as LoadoutItem[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function deleteLoadout(name: string): void {
  const db = openLocalDb();
  db.query("DELETE FROM loadouts WHERE name = ?").run(name);
}

// ---------------------------------------------------------------------------
// Saved searches
// ---------------------------------------------------------------------------

export function saveSearch(name: string, query: string): void {
  const db = openLocalDb();
  db.query(
    `INSERT OR REPLACE INTO saved_searches (name, query, created_at)
     VALUES (?, ?, unixepoch())`
  ).run(name, query);
}

export function listSearches(): SavedSearch[] {
  const db = openLocalDb();
  const rows = db
    .query(
      "SELECT name, query, created_at FROM saved_searches ORDER BY name"
    )
    .all() as { name: string; query: string; created_at: number }[];
  return rows.map((r) => ({
    name: r.name,
    query: r.query,
    createdAt: r.created_at,
  }));
}

export function deleteSearch(name: string): void {
  const db = openLocalDb();
  db.query("DELETE FROM saved_searches WHERE name = ?").run(name);
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

export async function backupLocalDb(destPath: string): Promise<void> {
  const dbPath = getDbPath();
  const data = await Bun.file(dbPath).arrayBuffer();
  await Bun.write(destPath, data);
  debug(`Local DB backed up to ${destPath}`);
}

export async function restoreLocalDb(srcPath: string): Promise<void> {
  closeLocalDb();
  const data = await Bun.file(srcPath).arrayBuffer();
  const dbPath = getDbPath();
  await Bun.write(dbPath, data);
  debug(`Local DB restored from ${srcPath}`);
}
