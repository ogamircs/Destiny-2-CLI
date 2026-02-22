import type { CharacterData } from "../api/profile.ts";
import type { IndexedItem, InventoryIndex } from "./item-index.ts";
import type { Wishlist, WishlistGrade } from "./wishlist.ts";
import { gradeItem } from "./wishlist.ts";
import type { PopularityDataset } from "./popularity.ts";
import {
  blendDeterministicWithPopularity,
  getPopularityScore,
} from "./popularity.ts";

const ANALYZED_SLOTS = [
  "Kinetic",
  "Energy",
  "Power",
  "Helmet",
  "Gauntlets",
  "Chest",
  "Legs",
  "Class Item",
] as const;

const GRADE_SCORE: Record<WishlistGrade, number> = {
  god: 1,
  good: 0.78,
  trash: 0.18,
  unknown: 0.45,
};

export interface OptimizerOptions {
  character: CharacterData;
  wishlist: Wishlist;
  withPopularity?: boolean;
  popularity?: PopularityDataset | null;
}

export interface OptimizerItemView {
  hash: number;
  name: string;
  power: number | null;
  location: string;
  tier: string;
  grade: WishlistGrade | null;
  popularityScore: number | null;
}

export interface SlotRecommendation {
  slot: string;
  currentItem: OptimizerItemView | null;
  suggestedItem: OptimizerItemView | null;
  score: number;
  delta: number;
  reasons: string[];
  alternatives: OptimizerItemView[];
}

export interface LoadoutAnalysis {
  character: {
    id: string;
    classType: number;
  };
  summary: {
    totalSlots: number;
    improvedSlots: number;
  };
  recommendations: SlotRecommendation[];
}

interface EvaluatedCandidate {
  item: IndexedItem;
  score: number;
  reasons: string[];
  grade: WishlistGrade | null;
  popularityScore: number | null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

function tierBaseScore(tier: string): number {
  switch (tier.toLowerCase()) {
    case "exotic":
      return 0.9;
    case "legendary":
      return 0.78;
    case "rare":
      return 0.62;
    default:
      return 0.5;
  }
}

function isEligibleForCharacter(item: IndexedItem, classType: number): boolean {
  return item.classRestriction === -1 || item.classRestriction === classType;
}

function candidateLocationScore(item: IndexedItem, characterId: string): number {
  if (item.location === characterId) {
    return 1;
  }
  if (item.location === "vault") {
    return 0.75;
  }
  return 0.5;
}

function transferScore(item: IndexedItem): number {
  if (item.nonTransferrable) {
    return 0.2;
  }
  if (item.transferStatus === 0) {
    return 1;
  }
  return 0.65;
}

function evaluateCandidate(
  item: IndexedItem,
  options: OptimizerOptions
): EvaluatedCandidate {
  const reasons: string[] = [];
  const isWeapon = item.itemType === 3;

  let grade: WishlistGrade | null = null;
  let deterministicBase = tierBaseScore(item.tier);

  if (isWeapon) {
    grade = gradeItem(item.hash, item.perks, options.wishlist);
    deterministicBase = GRADE_SCORE[grade];
    reasons.push(`Wishlist grade: ${grade}`);
  } else {
    reasons.push(`Tier baseline: ${item.tier}`);
  }

  const powerScore = clamp01((item.power ?? 0) / 2000);
  if (item.power !== undefined) {
    reasons.push(`Power ${item.power}`);
  }

  const locationScore = candidateLocationScore(item, options.character.characterId);
  reasons.push(
    item.location === options.character.characterId
      ? "Already on target character"
      : item.location === "vault"
        ? "Available in vault"
        : "Stored on another character"
  );

  const moveScore = transferScore(item);
  if (item.nonTransferrable) {
    reasons.push("Not transferrable");
  }

  let deterministicScore =
    deterministicBase * 0.6 +
    powerScore * 0.25 +
    locationScore * 0.1 +
    moveScore * 0.05;

  if (item.isLocked) {
    deterministicScore = Math.max(0, deterministicScore - 0.04);
    reasons.push("Locked (small penalty)");
  }

  if (item.isEquipped && item.location === options.character.characterId) {
    deterministicScore = Math.min(1, deterministicScore + 0.01);
  }

  const popularityScore =
    options.withPopularity && options.popularity
      ? getPopularityScore(options.popularity, item.hash)
      : null;

  if (options.withPopularity && popularityScore !== null) {
    reasons.push(`Popularity ${(popularityScore * 100).toFixed(1)}%`);
  }

  const blended = blendDeterministicWithPopularity(
    deterministicScore,
    popularityScore ?? undefined,
    options.withPopularity ? 0.15 : 0
  );

  return {
    item,
    score: roundScore(blended * 100),
    reasons,
    grade,
    popularityScore,
  };
}

function toItemView(candidate: EvaluatedCandidate): OptimizerItemView {
  return {
    hash: candidate.item.hash,
    name: candidate.item.name,
    power: candidate.item.power ?? null,
    location: candidate.item.location,
    tier: candidate.item.tier,
    grade: candidate.grade,
    popularityScore: candidate.popularityScore,
  };
}

export function analyzeLoadout(
  index: InventoryIndex,
  options: OptimizerOptions
): LoadoutAnalysis {
  let improvedSlots = 0;
  const recommendations: SlotRecommendation[] = [];

  for (const slot of ANALYZED_SLOTS) {
    const slotCandidates = index.all.filter(
      (item) =>
        item.slot === slot &&
        item.equippable &&
        isEligibleForCharacter(item, options.character.classType)
    );

    const evaluated = slotCandidates.map((item) => evaluateCandidate(item, options));
    evaluated.sort((a, b) => b.score - a.score);

    const best = evaluated[0] ?? null;
    const current =
      evaluated.find(
        (candidate) =>
          candidate.item.location === options.character.characterId &&
          candidate.item.isEquipped
      ) ?? null;

    const score = best?.score ?? 0;
    const delta = roundScore(score - (current?.score ?? 0));

    if (delta > 0.01) {
      improvedSlots++;
    }

    recommendations.push({
      slot,
      currentItem: current ? toItemView(current) : null,
      suggestedItem: best ? toItemView(best) : null,
      score,
      delta,
      reasons: best?.reasons ?? ["No eligible items found for slot"],
      alternatives: evaluated.slice(1, 4).map((candidate) => toItemView(candidate)),
    });
  }

  return {
    character: {
      id: options.character.characterId,
      classType: options.character.classType,
    },
    summary: {
      totalSlots: ANALYZED_SLOTS.length,
      improvedSlots,
    },
    recommendations,
  };
}
