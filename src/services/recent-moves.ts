import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getGame, type GameId } from "../games/context.ts";
import { getLocalPaths } from "./config.ts";

/** Bungie's profile can lag a successful move for a couple of minutes. */
export const RECENT_MOVE_TTL_MS = 3 * 60 * 1000;

export interface RecentMove {
  game: GameId;
  instanceId: string;
  hash: number;
  name: string;
  location: string;
  at: number;
}

export interface LocatedMoveItem {
  instanceId?: string;
  hash: number;
  name: string;
  inVault: boolean;
  characterId?: string;
  location: string;
}

function movesDirectory(): string {
  return process.env.DESTINY_RECENT_MOVES_DIR || getLocalPaths().configDir;
}

function movesPath(): string {
  return join(movesDirectory(), "recent-moves.json");
}

function isMove(value: unknown): value is RecentMove {
  if (!value || typeof value !== "object") return false;
  const move = value as Partial<RecentMove>;
  return (
    (move.game === "d1" || move.game === "d2") &&
    typeof move.instanceId === "string" &&
    typeof move.hash === "number" &&
    typeof move.name === "string" &&
    typeof move.location === "string" &&
    typeof move.at === "number"
  );
}

export function loadRecentMoves(now = Date.now()): RecentMove[] {
  const path = movesPath();
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const moves = Array.isArray(parsed) ? parsed.filter(isMove) : [];
    return moves.filter((move) => now - move.at < RECENT_MOVE_TTL_MS);
  } catch {
    return [];
  }
}

function saveMoves(moves: RecentMove[]): void {
  const dir = movesDirectory();
  mkdirSync(dir, { recursive: true });
  writeFileSync(movesPath(), JSON.stringify(moves));
}

export function recordRecentMove(
  move: Omit<RecentMove, "at" | "game"> & { game?: GameId; at?: number }
): void {
  const now = move.at ?? Date.now();
  const next: RecentMove = {
    game: move.game ?? getGame(),
    instanceId: move.instanceId,
    hash: move.hash,
    name: move.name,
    location: move.location,
    at: now,
  };
  const kept = loadRecentMoves(now).filter(
    (existing) =>
      !(existing.game === next.game && existing.instanceId === next.instanceId)
  );
  kept.push(next);
  saveMoves(kept);
}

export function recentLocation(
  instanceId: string | undefined,
  now = Date.now(),
  game: GameId = getGame()
): string | null {
  if (!instanceId) return null;
  const match = loadRecentMoves(now)
    .filter((move) => move.game === game && move.instanceId === instanceId)
    .sort((a, b) => b.at - a.at)[0];
  return match?.location ?? null;
}

export function hasRecentMoveMatching(
  query: string,
  now = Date.now(),
  game: GameId = getGame()
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return loadRecentMoves(now).some((move) => {
    if (move.game !== game) return false;
    const name = move.name.toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
}

export function applyRecentLocation<T extends LocatedMoveItem>(
  item: T,
  now = Date.now()
): T {
  const location = recentLocation(item.instanceId, now);
  if (!location) return item;
  if (location === "vault") {
    return {
      ...item,
      inVault: true,
      characterId: undefined,
      location: "Vault",
    };
  }
  return {
    ...item,
    inVault: false,
    characterId: location,
    location,
  };
}
