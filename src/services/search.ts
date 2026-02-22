import type { IndexedItem } from "./item-index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ItemPredicate = (item: IndexedItem, tags: string[]) => boolean;

// ---------------------------------------------------------------------------
// Power predicate
// ---------------------------------------------------------------------------

function parsePowerPredicate(value: string): (power: number) => boolean {
  if (value.startsWith(">=")) return (p) => p >= parseInt(value.slice(2), 10);
  if (value.startsWith("<=")) return (p) => p <= parseInt(value.slice(2), 10);
  if (value.startsWith(">")) return (p) => p > parseInt(value.slice(1), 10);
  if (value.startsWith("<")) return (p) => p < parseInt(value.slice(1), 10);
  const n = parseInt(value, 10);
  return (p) => p === n;
}

// ---------------------------------------------------------------------------
// Single term predicate
// ---------------------------------------------------------------------------

function buildTermPredicate(term: string): ItemPredicate {
  const lower = term.toLowerCase();

  // Negation
  let negated = false;
  let raw = lower;
  if (raw.startsWith("not:")) {
    negated = true;
    raw = raw.slice(4);
  } else if (raw.startsWith("-")) {
    negated = true;
    raw = raw.slice(1);
  }

  const colonIdx = raw.indexOf(":");
  const qualifier = colonIdx >= 0 ? raw.slice(0, colonIdx) : null;
  const value = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;

  let pred: ItemPredicate;

  if (qualifier === null) {
    // Bare text — name substring match
    pred = (item) => item.name.toLowerCase().includes(value);
  } else if (qualifier === "is") {
    pred = buildIsPredicate(value);
  } else if (qualifier === "tag") {
    pred = (_item, tags) => tags.includes(value);
  } else if (qualifier === "slot") {
    pred = (item) => item.slot.toLowerCase() === value;
  } else if (qualifier === "tier") {
    pred = (item) => item.tier.toLowerCase() === value;
  } else if (qualifier === "power") {
    const powerPred = parsePowerPredicate(value);
    pred = (item) => item.power !== undefined && powerPred(item.power);
  } else if (qualifier === "class") {
    pred = buildClassPredicate(value);
  } else {
    // Unknown qualifier → always false
    pred = () => false;
  }

  if (negated) {
    const inner = pred;
    return (item, tags) => !inner(item, tags);
  }
  return pred;
}

// ---------------------------------------------------------------------------
// is: qualifier
// ---------------------------------------------------------------------------

const ITEM_TYPE_MAP: Record<string, number> = {
  weapon: 3,
  armor: 2,
  ghost: 24,
  consumable: 9,
  mod: 19,
  emblem: 14,
  ship: 21,
  vehicle: 22,
  subclass: 16,
};

const TIER_MAP: Record<string, string> = {
  exotic: "Exotic",
  legendary: "Legendary",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};

// Bungie damage type enum: 0=None, 1=Kinetic, 2=Arc, 3=Solar, 4=Void, 5=Raid, 6=Stasis, 7=Strand
const DAMAGE_TYPE_MAP: Record<string, number> = {
  kinetic: 1,
  arc: 2,
  solar: 3,
  void: 4,
  stasis: 6,
  strand: 7,
};

const CLASS_MAP: Record<string, number> = {
  titan: 0,
  hunter: 1,
  warlock: 2,
};

function buildIsPredicate(value: string): ItemPredicate {
  if (value in ITEM_TYPE_MAP) {
    const typeNum = ITEM_TYPE_MAP[value]!;
    return (item) => item.itemType === typeNum;
  }
  if (value in TIER_MAP) {
    const tierStr = TIER_MAP[value]!;
    return (item) => item.tier === tierStr;
  }
  if (value === "equipped") {
    return (item) => item.isEquipped;
  }
  if (value === "locked") {
    return (item) => item.isLocked;
  }
  if (value === "vault") {
    return (item) => item.location === "vault";
  }
  if (value in DAMAGE_TYPE_MAP) {
    const dmg = DAMAGE_TYPE_MAP[value]!;
    return (item) => item.damageType === dmg;
  }
  if (value in CLASS_MAP) {
    const cls = CLASS_MAP[value]!;
    return (item) => item.classRestriction === cls;
  }
  // Unknown is: value → always false
  return () => false;
}

// ---------------------------------------------------------------------------
// class: qualifier
// ---------------------------------------------------------------------------

function buildClassPredicate(value: string): ItemPredicate {
  if (value === "any") {
    return (item) => item.classRestriction === -1;
  }
  if (value in CLASS_MAP) {
    const cls = CLASS_MAP[value]!;
    return (item) => item.classRestriction === cls;
  }
  return () => false;
}

// ---------------------------------------------------------------------------
// parseQuery — public API
// ---------------------------------------------------------------------------

/**
 * Parse a search query string into a predicate function.
 *
 * Grammar:
 *   query   := and-group ( "or" and-group )*
 *   and-group := term+
 *   term    := ["-" | "not:"] [qualifier ":"] value
 *
 * Empty query → all items pass.
 */
export function parseQuery(
  query: string
): (item: IndexedItem, tags: string[]) => boolean {
  const trimmed = query.trim();
  if (!trimmed) return () => true;

  // Split on " or " (case-insensitive, surrounded by spaces)
  const orParts = trimmed.split(/\s+or\s+/i);

  // Each OR part is an AND group of space-separated terms
  const orPredicates: ItemPredicate[] = orParts.map((part) => {
    const terms = part.trim().split(/\s+/).filter(Boolean);
    const andPredicates = terms.map(buildTermPredicate);
    return (item: IndexedItem, tags: string[]) =>
      andPredicates.every((p) => p(item, tags));
  });

  return (item: IndexedItem, tags: string[]) =>
    orPredicates.some((p) => p(item, tags));
}
