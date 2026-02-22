import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getLocalPaths } from "./config.ts";

interface SyncOperation {
  id: string;
  operation: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

interface SyncQueueFile {
  version: 1;
  operations: SyncOperation[];
}

interface SyncStateFile {
  version: 1;
  offline: boolean;
  lastReplayAt: number | null;
}

interface CloudMirrorFile {
  version: 1;
  updatedAt: number | null;
  operations: Array<{
    id: string;
    operation: string;
    payload: unknown;
    syncedAt: number;
  }>;
}

export interface SyncStatus {
  offline: boolean;
  queuedCount: number;
  lastReplayAt: number | null;
  cloudRecordCount: number;
}

export interface QueueOrSyncResult {
  queued: boolean;
  id: string;
  reason?: string;
}

export interface ReplayResult {
  replayed: number;
  failed: number;
  remaining: number;
}

function ensureConfigDir(): string {
  const dir = getLocalPaths().configDir;
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function queuePath(): string {
  return join(ensureConfigDir(), "sync-queue.json");
}

function statePath(): string {
  return join(ensureConfigDir(), "sync-state.json");
}

function cloudMirrorPath(): string {
  return join(ensureConfigDir(), "sync-cloud-mirror.json");
}

function safeReadJson(path: string): unknown | null {
  if (!existsSync(path)) {
    return null;
  }
  const text = readFileSync(path, "utf8");
  if (!text.trim()) {
    return null;
  }
  return JSON.parse(text);
}

function readQueue(): SyncQueueFile {
  const raw = safeReadJson(queuePath());
  if (!raw || typeof raw !== "object") {
    return { version: 1, operations: [] };
  }

  const typed = raw as Partial<SyncQueueFile>;
  if (!Array.isArray(typed.operations)) {
    return { version: 1, operations: [] };
  }

  return {
    version: 1,
    operations: typed.operations.filter(
      (entry): entry is SyncOperation =>
        Boolean(entry) &&
        typeof entry === "object" &&
        typeof (entry as SyncOperation).id === "string" &&
        typeof (entry as SyncOperation).operation === "string"
    ),
  };
}

function writeQueue(queue: SyncQueueFile): void {
  writeFileSync(queuePath(), JSON.stringify(queue, null, 2));
}

function readState(): SyncStateFile {
  const raw = safeReadJson(statePath());
  if (!raw || typeof raw !== "object") {
    return {
      version: 1,
      offline: false,
      lastReplayAt: null,
    };
  }

  const typed = raw as Partial<SyncStateFile>;
  return {
    version: 1,
    offline: Boolean(typed.offline),
    lastReplayAt:
      typeof typed.lastReplayAt === "number" ? typed.lastReplayAt : null,
  };
}

function writeState(state: SyncStateFile): void {
  writeFileSync(statePath(), JSON.stringify(state, null, 2));
}

function readCloudMirror(): CloudMirrorFile {
  const raw = safeReadJson(cloudMirrorPath());
  if (!raw || typeof raw !== "object") {
    return {
      version: 1,
      updatedAt: null,
      operations: [],
    };
  }

  const typed = raw as Partial<CloudMirrorFile>;
  return {
    version: 1,
    updatedAt: typeof typed.updatedAt === "number" ? typed.updatedAt : null,
    operations: Array.isArray(typed.operations) ? typed.operations : [],
  };
}

function writeCloudMirror(cloud: CloudMirrorFile): void {
  writeFileSync(cloudMirrorPath(), JSON.stringify(cloud, null, 2));
}

function createOperationId(): string {
  return `op-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function appendToCloudMirror(operation: SyncOperation): void {
  const cloud = readCloudMirror();
  cloud.operations.push({
    id: operation.id,
    operation: operation.operation,
    payload: operation.payload,
    syncedAt: Math.floor(Date.now() / 1000),
  });
  cloud.updatedAt = Math.floor(Date.now() / 1000);
  writeCloudMirror(cloud);
}

function enqueue(operation: SyncOperation): void {
  const queue = readQueue();
  queue.operations.push(operation);
  writeQueue(queue);
}

export function getSyncStatus(): SyncStatus {
  const queue = readQueue();
  const state = readState();
  const cloud = readCloudMirror();

  return {
    offline: state.offline,
    queuedCount: queue.operations.length,
    lastReplayAt: state.lastReplayAt,
    cloudRecordCount: cloud.operations.length,
  };
}

export function setSyncOfflineMode(offline: boolean): SyncStatus {
  const state = readState();
  state.offline = offline;
  writeState(state);
  return getSyncStatus();
}

export async function queueOrSyncOperation(
  operation: string,
  payload: unknown
): Promise<QueueOrSyncResult> {
  const state = readState();
  const op: SyncOperation = {
    id: createOperationId(),
    operation,
    payload,
    createdAt: Math.floor(Date.now() / 1000),
    attempts: 0,
  };

  if (state.offline) {
    enqueue(op);
    return {
      queued: true,
      id: op.id,
      reason: "offline mode enabled",
    };
  }

  try {
    appendToCloudMirror(op);
    return {
      queued: false,
      id: op.id,
    };
  } catch (err) {
    op.attempts = 1;
    op.lastError = err instanceof Error ? err.message : String(err);
    enqueue(op);
    return {
      queued: true,
      id: op.id,
      reason: op.lastError,
    };
  }
}

export async function replaySyncQueue(): Promise<ReplayResult> {
  const state = readState();
  const queue = readQueue();

  if (state.offline) {
    return {
      replayed: 0,
      failed: 0,
      remaining: queue.operations.length,
    };
  }

  let replayed = 0;
  let failed = 0;
  const remaining: SyncOperation[] = [];

  for (const op of queue.operations) {
    try {
      appendToCloudMirror(op);
      replayed++;
    } catch (err) {
      failed++;
      remaining.push({
        ...op,
        attempts: op.attempts + 1,
        lastError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  writeQueue({
    version: 1,
    operations: remaining,
  });

  state.lastReplayAt = Math.floor(Date.now() / 1000);
  writeState(state);

  return {
    replayed,
    failed,
    remaining: remaining.length,
  };
}
