import { homedir } from "os";
import { join } from "path";

export interface PopularityDataset {
  sourceLabel: string;
  scores: Map<number, number>;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function parseHash(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseScore(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 1) {
      return clamp01(value / 100);
    }
    return clamp01(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed)) {
      return null;
    }
    if (parsed > 1) {
      return clamp01(parsed / 100);
    }
    return clamp01(parsed);
  }

  return null;
}

function pushRecord(
  scores: Map<number, number>,
  hashValue: unknown,
  scoreValue: unknown
): void {
  const hash = parseHash(hashValue);
  const score = parseScore(scoreValue);
  if (hash === null || score === null) {
    return;
  }
  scores.set(hash, score);
}

function parsePopularityPayload(payload: unknown): Map<number, number> {
  const scores = new Map<number, number>();

  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const typedRow = row as Record<string, unknown>;
      pushRecord(
        scores,
        typedRow.itemHash ?? typedRow.hash ?? typedRow.weaponHash,
        typedRow.score ??
          typedRow.popularity ??
          typedRow.rating ??
          typedRow.weight
      );
    }
    return scores;
  }

  if (!payload || typeof payload !== "object") {
    return scores;
  }

  const objectPayload = payload as Record<string, unknown>;
  const nestedItems = objectPayload.items;
  if (Array.isArray(nestedItems)) {
    for (const row of nestedItems) {
      if (!row || typeof row !== "object") {
        continue;
      }
      const typedRow = row as Record<string, unknown>;
      pushRecord(
        scores,
        typedRow.itemHash ?? typedRow.hash ?? typedRow.weaponHash,
        typedRow.score ??
          typedRow.popularity ??
          typedRow.rating ??
          typedRow.weight
      );
    }
  }

  const nestedScores = objectPayload.scores;
  if (nestedScores && typeof nestedScores === "object" && !Array.isArray(nestedScores)) {
    for (const [key, value] of Object.entries(
      nestedScores as Record<string, unknown>
    )) {
      if (value && typeof value === "object") {
        const typedValue = value as Record<string, unknown>;
        pushRecord(scores, key, typedValue.score ?? typedValue.popularity);
      } else {
        pushRecord(scores, key, value);
      }
    }
  }

  for (const [key, value] of Object.entries(objectPayload)) {
    if (key === "items" || key === "scores") {
      continue;
    }
    if (typeof value === "number" || typeof value === "string") {
      pushRecord(scores, key, value);
      continue;
    }
    if (value && typeof value === "object") {
      const typedValue = value as Record<string, unknown>;
      pushRecord(scores, key, typedValue.score ?? typedValue.popularity);
    }
  }

  return scores;
}

function expandHomePath(pathValue: string): string {
  if (pathValue === "~") {
    return homedir();
  }
  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }
  return pathValue;
}

export async function loadPopularitySource(
  source: string | undefined
): Promise<PopularityDataset> {
  const trimmed = source?.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return {
      sourceLabel: "none",
      scores: new Map(),
    };
  }

  let text: string;

  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch popularity source ${trimmed}: HTTP ${response.status}`
      );
    }
    text = await response.text();
  } else {
    const resolvedPath = expandHomePath(trimmed);
    const file = Bun.file(resolvedPath);
    const exists = await file.exists();
    if (!exists) {
      throw new Error(`Popularity source file not found: ${resolvedPath}`);
    }
    text = await file.text();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Failed to parse popularity source "${trimmed}" as JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    sourceLabel: trimmed,
    scores: parsePopularityPayload(parsed),
  };
}

export function getPopularityScore(
  dataset: PopularityDataset,
  itemHash: number
): number | null {
  const score = dataset.scores.get(itemHash);
  return score === undefined ? null : score;
}

export function blendDeterministicWithPopularity(
  deterministicScore: number,
  popularityScore: number | undefined,
  popularityWeight: number
): number {
  const deterministic = clamp01(deterministicScore);
  if (popularityScore === undefined || popularityWeight <= 0) {
    return deterministic;
  }

  const popularity = clamp01(popularityScore);
  const weight = clamp01(popularityWeight);
  return deterministic * (1 - weight) + popularity * weight;
}
