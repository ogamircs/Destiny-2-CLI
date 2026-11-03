import {
  getD1Account,
  getD1Advisors,
  getD1Grimoire,
  getD1Progression,
} from "../api/d1/endpoints.ts";
import { normalizeD1Account } from "../api/d1/normalize.ts";
import { asRecord } from "../api/d1/paths.ts";
import { className } from "../ui/format.ts";
import {
  lookupFactionNameForProgression,
  lookupManifestName,
} from "./manifest-cache.ts";
import { htmlToText, isInternalCodeName } from "./definition-name.ts";
import { resolveActiveMembership } from "./membership.ts";

export interface D1ProgressionRow {
  name: string;
  level: number;
  progress: string;
}

export interface D1ProgressCharacter {
  className: string;
  light: number;
  level: number;
  progressions: D1ProgressionRow[];
}

export interface D1ProgressReport {
  grimoireScore: number;
  characters: D1ProgressCharacter[];
}

export interface D1RecordBook {
  name: string;
  completed: number;
  percent: number | null;
}

export interface D1RecordsReport {
  grimoireScore: number;
  cardCount: number | null;
  books: D1RecordBook[];
}

export interface D1AdvisorActivity {
  name: string;
  active: boolean | null;
  about: string;
}

export interface D1AdvisorCharacter {
  className: string;
  activities: D1AdvisorActivity[];
}

function numberOf(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function progressionRows(raw: unknown): D1ProgressionRow[] {
  const record = asRecord(raw);
  const progressions = Array.isArray(record?.progressions) ? record.progressions : [];
  return progressions.flatMap((entry) => {
    const progression = asRecord(entry);
    if (!progression) return [];
    const hash = numberOf(progression.progressionHash);
    const level = numberOf(progression.level) ?? 0;
    const current = numberOf(progression.currentProgress) ?? numberOf(progression.progressToNextLevel) ?? 0;
    const next = numberOf(progression.nextLevelAt);
    const definitionName =
      hash !== undefined ? lookupManifestName("DestinyProgressionDefinition", hash) : null;
    const factionName =
      hash !== undefined ? lookupFactionNameForProgression(hash) : null;
    const name =
      (factionName && !isInternalCodeName(factionName) ? factionName : null) ??
      definitionName ??
      (hash !== undefined ? `Progression ${hash}` : "Progression");
    return [{
      name,
      level,
      progress: next === undefined ? String(current) : `${current}/${next}`,
    }];
  });
}

export async function loadD1ProgressReport(): Promise<D1ProgressReport> {
  const membership = await resolveActiveMembership();
  const account = normalizeD1Account(await getD1Account(membership));
  const characters = await Promise.all(
    account.characters.map(async (character) => {
      let rows: D1ProgressionRow[] = [];
      try {
        rows = progressionRows(await getD1Progression(membership, character.characterId));
      } catch {
        rows = [];
      }
      return {
        className: className(character.classType),
        light: character.light,
        level: character.level,
        progressions: rows,
      };
    })
  );

  return { grimoireScore: account.grimoireScore, characters };
}

function cardCount(raw: unknown): number | null {
  const record = asRecord(raw);
  if (!record) return null;
  if (Array.isArray(record.cardCollection)) return record.cardCollection.length;
  const scoreCard = asRecord(record.score);
  if (Array.isArray(scoreCard?.cardCollection)) return scoreCard.cardCollection.length;
  return null;
}

function grimoireScoreFrom(raw: unknown, fallback: number): number {
  const record = asRecord(raw);
  return numberOf(record?.score) ?? numberOf(record?.cardCollectionScore) ?? fallback;
}

export async function loadD1RecordsReport(): Promise<D1RecordsReport> {
  const membership = await resolveActiveMembership();
  const account = normalizeD1Account(await getD1Account(membership));
  let cards: number | null = null;
  let grimoireScore = account.grimoireScore;
  try {
    const grimoire = await getD1Grimoire(membership);
    cards = cardCount(grimoire);
    grimoireScore = grimoireScoreFrom(grimoire, grimoireScore);
  } catch {
    cards = null;
  }

  const books = new Map<string, D1RecordBook>();
  await Promise.all(
    account.characters.map(async (character) => {
      try {
        const advisors = asRecord(await getD1Advisors(membership, character.characterId));
        const recordBooks = asRecord(advisors?.recordBooks) ?? {};
        for (const [hash, value] of Object.entries(recordBooks)) {
          const book = asRecord(value);
          if (!book) continue;
          const numericHash = Number(hash);
          const name =
            (Number.isFinite(numericHash)
              ? lookupManifestName("DestinyRecordBookDefinition", numericHash)
              : null) ?? `Record book ${hash}`;
          const completed = numberOf(book.completedCount) ?? 0;
          const percent = numberOf(book.percentComplete) ?? null;
          const existing = books.get(name);
          if (!existing || completed > existing.completed) {
            books.set(name, { name, completed, percent });
          }
        }
      } catch {
        // One character's advisor payload should not hide the grimoire score.
      }
    })
  );

  return {
    grimoireScore,
    cardCount: cards,
    books: [...books.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function loadD1Advisors(): Promise<D1AdvisorCharacter[]> {
  const membership = await resolveActiveMembership();
  const account = normalizeD1Account(await getD1Account(membership));
  return Promise.all(
    account.characters.map(async (character) => {
      const advisors = asRecord(await getD1Advisors(membership, character.characterId));
      const activities = asRecord(advisors?.activities) ?? {};
      const rows: D1AdvisorActivity[] = [];
      for (const [key, value] of Object.entries(activities)) {
        const activity = asRecord(value);
        if (!activity) continue;
        const display = asRecord(activity.display);
        const status = asRecord(activity.status);
        const rawName =
          (typeof display?.advisorTypeCategory === "string" && display.advisorTypeCategory) ||
          (typeof activity.identifier === "string" && activity.identifier) ||
          key;
        rows.push({
          name: htmlToText(rawName),
          active: typeof status?.active === "boolean" ? status.active : null,
          about: htmlToText(typeof display?.about === "string" ? display.about : ""),
        });
      }
      rows.sort((a, b) => a.name.localeCompare(b.name));
      return { className: className(character.classType), activities: rows };
    })
  );
}
