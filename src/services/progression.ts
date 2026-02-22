import { className } from "../ui/format.ts";
import type {
  CharacterVendorsResponse,
  ChecklistProgress,
  MetricProgress,
  ObjectiveProgress,
  PresentationNodeProgress,
  RecordProgress,
} from "../api/progression.ts";

export interface CharacterPowerSummary {
  characterId: string;
  className: string;
  light: number;
  deltaToCap: number | null;
}

export interface ProgressSummary {
  seasonPowerCap: number | null;
  highestPower: number | null;
  lowestPower: number | null;
  averagePower: number | null;
  characterCount: number;
}

export interface ProfileCounterSummary {
  currentGuardianRank: number | null;
  lifetimeHighestGuardianRank: number | null;
  artifactPowerBonus: number | null;
  checklistObjectivesCompleted: number;
  checklistObjectivesTotal: number;
  metricsCompleted: number;
  metricsTotal: number;
}

export interface ProgressReport {
  summary: ProgressSummary;
  characters: CharacterPowerSummary[];
  profileCounters: ProfileCounterSummary;
}

export interface FeaturedVendorSummary {
  vendorHash: number;
  vendorLabel: string;
  characters: string[];
  categoryCount: number;
  saleItemCount: number;
  enabledOn: number;
  nextRefreshDate: string | null;
}

export interface VendorsReport {
  summary: {
    characterCount: number;
    vendorCount: number;
    categoryCount: number;
    saleItemCount: number;
  };
  vendors: FeaturedVendorSummary[];
}

export interface CharacterVendorSnapshot {
  characterId: string;
  classType: number;
  response: CharacterVendorsResponse;
}

export interface RecordSummary {
  recordHash: string;
  completionPct: number;
  isComplete: boolean;
}

export interface CharacterRecordsSummary {
  characterId: string;
  className: string;
  recordsCompleted: number;
  recordsTotal: number;
  completionPct: number;
}

export interface RecordsReport {
  summary: {
    profileRecordsCompleted: number;
    profileRecordsTotal: number;
    profileCompletionPct: number;
    sealNodesCompleted: number;
    sealNodesTotal: number;
    sealCompletionPct: number;
  };
  characters: CharacterRecordsSummary[];
  trackedRecords: RecordSummary[];
}

interface CharacterLightLike {
  characterId: string;
  classType: number;
  light: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function objectivePct(objective: ObjectiveProgress): number {
  const completionValue = objective.completionValue ?? 0;
  if (completionValue > 0) {
    const progress = objective.progress ?? 0;
    return Math.max(0, Math.min(100, (progress / completionValue) * 100));
  }

  if (objective.complete) return 100;
  return 0;
}

function objectiveComplete(objective: ObjectiveProgress): boolean {
  if (typeof objective.complete === "boolean") return objective.complete;
  const completionValue = objective.completionValue ?? 0;
  if (completionValue <= 0) return false;
  return (objective.progress ?? 0) >= completionValue;
}

function aggregateObjectives(
  objectives: ObjectiveProgress[] | undefined
): { completionPct: number; isComplete: boolean } {
  if (!objectives || objectives.length === 0) {
    return { completionPct: 0, isComplete: false };
  }

  const pct =
    objectives.reduce((sum, objective) => sum + objectivePct(objective), 0) /
    objectives.length;

  return {
    completionPct: round2(pct),
    isComplete: objectives.every((objective) => objectiveComplete(objective)),
  };
}

function checklistEntryComplete(entry: {
  completed?: boolean;
  state?: number;
  objective?: ObjectiveProgress;
}): boolean {
  if (typeof entry.completed === "boolean") return entry.completed;
  if (typeof entry.state === "number") return (entry.state & 1) === 1;
  if (entry.objective) return objectiveComplete(entry.objective);
  return false;
}

export function buildProgressReport(input: {
  characters?: Record<string, CharacterLightLike>;
  seasonPowerCap?: number;
  currentGuardianRank?: number;
  lifetimeHighestGuardianRank?: number;
  artifactPowerBonus?: number;
  checklists?: Record<string, ChecklistProgress>;
  metrics?: Record<string, MetricProgress>;
}): ProgressReport {
  const seasonPowerCap = input.seasonPowerCap ?? null;
  const characters = Object.values(input.characters ?? {})
    .map((character) => ({
      characterId: character.characterId,
      className: className(character.classType),
      light: character.light,
      deltaToCap:
        seasonPowerCap === null ? null : Math.max(0, seasonPowerCap - character.light),
    }))
    .sort((a, b) => b.light - a.light);

  const lights = characters.map((character) => character.light);
  const highestPower = lights.length > 0 ? Math.max(...lights) : null;
  const lowestPower = lights.length > 0 ? Math.min(...lights) : null;
  const averagePower =
    lights.length > 0 ? round2(lights.reduce((a, b) => a + b, 0) / lights.length) : null;

  const checklistEntries = Object.values(input.checklists ?? {}).flatMap(
    (checklist) => checklist.entries ?? []
  );
  const checklistObjectivesTotal = checklistEntries.length;
  const checklistObjectivesCompleted = checklistEntries.filter(checklistEntryComplete).length;

  const metricProgressions = Object.values(input.metrics ?? {})
    .map((metric) => metric.objectiveProgress)
    .filter((metric): metric is ObjectiveProgress => Boolean(metric));

  const metricsTotal = metricProgressions.length;
  const metricsCompleted = metricProgressions.filter(objectiveComplete).length;

  return {
    summary: {
      seasonPowerCap,
      highestPower,
      lowestPower,
      averagePower,
      characterCount: characters.length,
    },
    characters,
    profileCounters: {
      currentGuardianRank: input.currentGuardianRank ?? null,
      lifetimeHighestGuardianRank: input.lifetimeHighestGuardianRank ?? null,
      artifactPowerBonus: input.artifactPowerBonus ?? null,
      checklistObjectivesCompleted,
      checklistObjectivesTotal,
      metricsCompleted,
      metricsTotal,
    },
  };
}

export function buildVendorsReport(
  snapshots: CharacterVendorSnapshot[]
): VendorsReport {
  const vendorMap = new Map<
    number,
    {
      vendorHash: number;
      characters: Set<string>;
      categoryCount: number;
      saleItemCount: number;
      enabledOn: number;
      nextRefreshDate: string | null;
    }
  >();

  for (const snapshot of snapshots) {
    const vendors = snapshot.response.vendors?.data ?? {};
    const categories = snapshot.response.categories?.data ?? {};

    for (const [vendorKey, vendor] of Object.entries(vendors)) {
      const vendorHash = vendor.vendorHash || Number(vendorKey);
      if (!vendorHash) continue;

      const categoryData = categories[vendorKey];
      const vendorCategories = categoryData?.categories ?? [];
      const categoryCount = vendorCategories.length;
      const saleItemCount = vendorCategories.reduce(
        (sum, category) => sum + (category.itemIndexes?.length ?? 0),
        0
      );

      const current = vendorMap.get(vendorHash) ?? {
        vendorHash,
        characters: new Set<string>(),
        categoryCount: 0,
        saleItemCount: 0,
        enabledOn: 0,
        nextRefreshDate: null,
      };

      current.characters.add(className(snapshot.classType));
      current.categoryCount += categoryCount;
      current.saleItemCount += saleItemCount;
      if (vendor.enabled) current.enabledOn += 1;
      if (!current.nextRefreshDate && vendor.nextRefreshDate) {
        current.nextRefreshDate = vendor.nextRefreshDate;
      }

      vendorMap.set(vendorHash, current);
    }
  }

  const vendors: FeaturedVendorSummary[] = [...vendorMap.values()]
    .map((vendor) => ({
      vendorHash: vendor.vendorHash,
      vendorLabel: `Vendor ${vendor.vendorHash}`,
      characters: [...vendor.characters].sort((a, b) => a.localeCompare(b)),
      categoryCount: vendor.categoryCount,
      saleItemCount: vendor.saleItemCount,
      enabledOn: vendor.enabledOn,
      nextRefreshDate: vendor.nextRefreshDate,
    }))
    .sort((a, b) => {
      if (b.saleItemCount !== a.saleItemCount) {
        return b.saleItemCount - a.saleItemCount;
      }
      if (b.categoryCount !== a.categoryCount) {
        return b.categoryCount - a.categoryCount;
      }
      return a.vendorHash - b.vendorHash;
    });

  return {
    summary: {
      characterCount: snapshots.length,
      vendorCount: vendors.length,
      categoryCount: vendors.reduce((sum, vendor) => sum + vendor.categoryCount, 0),
      saleItemCount: vendors.reduce((sum, vendor) => sum + vendor.saleItemCount, 0),
    },
    vendors,
  };
}

function summarizeRecords(
  records: Record<string, RecordProgress> | undefined
): {
  completed: number;
  total: number;
  summaries: RecordSummary[];
} {
  const entries = Object.entries(records ?? {});
  const summaries = entries.map(([recordHash, record]) => {
    const aggregate = aggregateObjectives(record.objectives);
    return {
      recordHash,
      completionPct: aggregate.completionPct,
      isComplete: aggregate.isComplete,
    };
  });

  const completed = summaries.filter((record) => record.isComplete).length;
  const total = summaries.length;
  return { completed, total, summaries };
}

function summarizeSealNodes(
  nodes: Record<string, PresentationNodeProgress> | undefined
): { completed: number; total: number } {
  const entries = Object.values(nodes ?? {});
  let completed = 0;

  for (const node of entries) {
    if (node.objectives && node.objectives.length > 0) {
      if (aggregateObjectives(node.objectives).isComplete) {
        completed += 1;
      }
      continue;
    }

    if (typeof node.state === "number" && (node.state & 1) === 1) {
      completed += 1;
    }
  }

  return {
    completed,
    total: entries.length,
  };
}

export function buildRecordsReport(input: {
  characters?: Record<string, { characterId: string; classType: number }>;
  profileRecords?: Record<string, RecordProgress>;
  characterRecords?: Record<string, { records?: Record<string, RecordProgress> }>;
  profilePresentationNodes?: Record<string, PresentationNodeProgress>;
}): RecordsReport {
  const profileRecordsSummary = summarizeRecords(input.profileRecords);
  const sealSummary = summarizeSealNodes(input.profilePresentationNodes);

  const characterSummaries = Object.values(input.characters ?? {})
    .map((character) => {
      const records = input.characterRecords?.[character.characterId]?.records;
      const summary = summarizeRecords(records);
      const completionPct =
        summary.total > 0 ? round2((summary.completed / summary.total) * 100) : 0;
      return {
        characterId: character.characterId,
        className: className(character.classType),
        recordsCompleted: summary.completed,
        recordsTotal: summary.total,
        completionPct,
      };
    })
    .sort((a, b) => {
      if (b.completionPct !== a.completionPct) {
        return b.completionPct - a.completionPct;
      }
      return a.className.localeCompare(b.className);
    });

  const trackedRecords = profileRecordsSummary.summaries
    .filter((record) => !record.isComplete)
    .sort((a, b) => b.completionPct - a.completionPct)
    .slice(0, 10);

  return {
    summary: {
      profileRecordsCompleted: profileRecordsSummary.completed,
      profileRecordsTotal: profileRecordsSummary.total,
      profileCompletionPct:
        profileRecordsSummary.total > 0
          ? round2((profileRecordsSummary.completed / profileRecordsSummary.total) * 100)
          : 0,
      sealNodesCompleted: sealSummary.completed,
      sealNodesTotal: sealSummary.total,
      sealCompletionPct:
        sealSummary.total > 0 ? round2((sealSummary.completed / sealSummary.total) * 100) : 0,
    },
    characters: characterSummaries,
    trackedRecords,
  };
}
