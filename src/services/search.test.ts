import { describe, test, expect } from "bun:test";
import { parseQuery } from "./search.ts";
import type { IndexedItem } from "./item-index.ts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<IndexedItem> = {}): IndexedItem {
  return {
    hash: 1234,
    instanceId: "inst-1",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 0,
    isLocked: false,
    name: "Test Item",
    itemType: 3, // weapon
    itemSubType: 6,
    tier: "Legendary",
    slot: "Kinetic",
    classRestriction: -1,
    icon: "",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
    power: 1810,
    damageType: 3, // solar
    energyCapacity: undefined,
    energyUsed: undefined,
    isEquipped: false,
    canEquip: true,
    location: "char-1",
    perks: undefined,
    ...overrides,
  };
}

const noTags: string[] = [];

// ---------------------------------------------------------------------------
// is: qualifier — itemType
// ---------------------------------------------------------------------------

describe("is: itemType", () => {
  test("is:weapon matches weapon", () => {
    const pred = parseQuery("is:weapon");
    expect(pred(makeItem({ itemType: 3 }), noTags)).toBe(true);
  });

  test("is:weapon rejects armor", () => {
    const pred = parseQuery("is:weapon");
    expect(pred(makeItem({ itemType: 2 }), noTags)).toBe(false);
  });

  test("is:armor matches armor", () => {
    const pred = parseQuery("is:armor");
    expect(pred(makeItem({ itemType: 2 }), noTags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// is: qualifier — tier
// ---------------------------------------------------------------------------

describe("is: tier", () => {
  test("is:exotic matches exotic tier", () => {
    const pred = parseQuery("is:exotic");
    expect(pred(makeItem({ tier: "Exotic" }), noTags)).toBe(true);
  });

  test("is:exotic rejects legendary", () => {
    const pred = parseQuery("is:exotic");
    expect(pred(makeItem({ tier: "Legendary" }), noTags)).toBe(false);
  });

  test("is:legendary matches legendary tier", () => {
    const pred = parseQuery("is:legendary");
    expect(pred(makeItem({ tier: "Legendary" }), noTags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// is: qualifier — state flags
// ---------------------------------------------------------------------------

describe("is: state flags", () => {
  test("is:equipped matches equipped item", () => {
    const pred = parseQuery("is:equipped");
    expect(pred(makeItem({ isEquipped: true }), noTags)).toBe(true);
  });

  test("is:equipped rejects unequipped", () => {
    const pred = parseQuery("is:equipped");
    expect(pred(makeItem({ isEquipped: false }), noTags)).toBe(false);
  });

  test("is:locked matches locked item", () => {
    const pred = parseQuery("is:locked");
    expect(pred(makeItem({ isLocked: true }), noTags)).toBe(true);
  });

  test("is:locked rejects unlocked item", () => {
    const pred = parseQuery("is:locked");
    expect(pred(makeItem({ isLocked: false }), noTags)).toBe(false);
  });

  test("is:vault matches vault item", () => {
    const pred = parseQuery("is:vault");
    expect(pred(makeItem({ location: "vault" }), noTags)).toBe(true);
  });

  test("is:vault rejects character item", () => {
    const pred = parseQuery("is:vault");
    expect(pred(makeItem({ location: "char-1" }), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// is: qualifier — damageType
// ---------------------------------------------------------------------------

describe("is: damageType", () => {
  test("is:solar matches solar (3)", () => {
    const pred = parseQuery("is:solar");
    expect(pred(makeItem({ damageType: 3 }), noTags)).toBe(true);
  });

  test("is:arc matches arc (2)", () => {
    const pred = parseQuery("is:arc");
    expect(pred(makeItem({ damageType: 2 }), noTags)).toBe(true);
  });

  test("is:solar rejects arc", () => {
    const pred = parseQuery("is:solar");
    expect(pred(makeItem({ damageType: 2 }), noTags)).toBe(false);
  });

  test("is:void matches void (4)", () => {
    const pred = parseQuery("is:void");
    expect(pred(makeItem({ damageType: 4 }), noTags)).toBe(true);
  });

  test("is:stasis matches stasis (6)", () => {
    const pred = parseQuery("is:stasis");
    expect(pred(makeItem({ damageType: 6 }), noTags)).toBe(true);
  });

  test("is:strand matches strand (7)", () => {
    const pred = parseQuery("is:strand");
    expect(pred(makeItem({ damageType: 7 }), noTags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// is: qualifier — classRestriction
// ---------------------------------------------------------------------------

describe("is: class restriction", () => {
  test("is:titan matches titan (0)", () => {
    const pred = parseQuery("is:titan");
    expect(pred(makeItem({ classRestriction: 0 }), noTags)).toBe(true);
  });

  test("is:titan rejects warlock", () => {
    const pred = parseQuery("is:titan");
    expect(pred(makeItem({ classRestriction: 2 }), noTags)).toBe(false);
  });

  test("is:hunter matches hunter (1)", () => {
    const pred = parseQuery("is:hunter");
    expect(pred(makeItem({ classRestriction: 1 }), noTags)).toBe(true);
  });

  test("is:warlock matches warlock (2)", () => {
    const pred = parseQuery("is:warlock");
    expect(pred(makeItem({ classRestriction: 2 }), noTags)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// tag: qualifier
// ---------------------------------------------------------------------------

describe("tag:", () => {
  test("tag:god-roll matches when tag present", () => {
    const pred = parseQuery("tag:god-roll");
    expect(pred(makeItem(), ["god-roll", "keeper"])).toBe(true);
  });

  test("tag:god-roll fails when tag absent", () => {
    const pred = parseQuery("tag:god-roll");
    expect(pred(makeItem(), ["trash"])).toBe(false);
  });

  test("tag:god-roll fails with empty tags", () => {
    const pred = parseQuery("tag:god-roll");
    expect(pred(makeItem(), [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// slot: qualifier
// ---------------------------------------------------------------------------

describe("slot:", () => {
  test("slot:kinetic matches (case insensitive)", () => {
    const pred = parseQuery("slot:kinetic");
    expect(pred(makeItem({ slot: "Kinetic" }), noTags)).toBe(true);
  });

  test("slot:Kinetic matches (uppercase query)", () => {
    const pred = parseQuery("slot:Kinetic");
    expect(pred(makeItem({ slot: "Kinetic" }), noTags)).toBe(true);
  });

  test("slot:kinetic rejects energy slot", () => {
    const pred = parseQuery("slot:kinetic");
    expect(pred(makeItem({ slot: "Energy" }), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tier: qualifier
// ---------------------------------------------------------------------------

describe("tier:", () => {
  test("tier:exotic matches (case insensitive)", () => {
    const pred = parseQuery("tier:exotic");
    expect(pred(makeItem({ tier: "Exotic" }), noTags)).toBe(true);
  });

  test("tier:Exotic matches (uppercase query)", () => {
    const pred = parseQuery("tier:Exotic");
    expect(pred(makeItem({ tier: "Exotic" }), noTags)).toBe(true);
  });

  test("tier:exotic rejects legendary", () => {
    const pred = parseQuery("tier:exotic");
    expect(pred(makeItem({ tier: "Legendary" }), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// power: qualifier
// ---------------------------------------------------------------------------

describe("power:", () => {
  test("power:>1800 matches 1810", () => {
    const pred = parseQuery("power:>1800");
    expect(pred(makeItem({ power: 1810 }), noTags)).toBe(true);
  });

  test("power:>1800 rejects 1800", () => {
    const pred = parseQuery("power:>1800");
    expect(pred(makeItem({ power: 1800 }), noTags)).toBe(false);
  });

  test("power:<=1750 matches 1750", () => {
    const pred = parseQuery("power:<=1750");
    expect(pred(makeItem({ power: 1750 }), noTags)).toBe(true);
  });

  test("power:<=1750 rejects 1751", () => {
    const pred = parseQuery("power:<=1750");
    expect(pred(makeItem({ power: 1751 }), noTags)).toBe(false);
  });

  test("power:>=1800 matches 1800", () => {
    const pred = parseQuery("power:>=1800");
    expect(pred(makeItem({ power: 1800 }), noTags)).toBe(true);
  });

  test("power:<1800 matches 1799", () => {
    const pred = parseQuery("power:<1800");
    expect(pred(makeItem({ power: 1799 }), noTags)).toBe(true);
  });

  test("power:1810 matches exact", () => {
    const pred = parseQuery("power:1810");
    expect(pred(makeItem({ power: 1810 }), noTags)).toBe(true);
  });

  test("power:1810 rejects 1811", () => {
    const pred = parseQuery("power:1810");
    expect(pred(makeItem({ power: 1811 }), noTags)).toBe(false);
  });

  test("power:>1800 rejects item with no power", () => {
    const pred = parseQuery("power:>1800");
    expect(pred(makeItem({ power: undefined }), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bare text
// ---------------------------------------------------------------------------

describe("bare text", () => {
  test("name substring match (case insensitive)", () => {
    const pred = parseQuery("ace");
    expect(pred(makeItem({ name: "Ace of Spades" }), noTags)).toBe(true);
  });

  test("no match when name missing substring", () => {
    const pred = parseQuery("outbreak");
    expect(pred(makeItem({ name: "Ace of Spades" }), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Compound: AND (implicit)
// ---------------------------------------------------------------------------

describe("AND (implicit)", () => {
  test("is:weapon tier:exotic — both must match", () => {
    const pred = parseQuery("is:weapon tier:exotic");
    expect(pred(makeItem({ itemType: 3, tier: "Exotic" }), noTags)).toBe(true);
    expect(pred(makeItem({ itemType: 3, tier: "Legendary" }), noTags)).toBe(
      false
    );
    expect(pred(makeItem({ itemType: 2, tier: "Exotic" }), noTags)).toBe(false);
  });

  test("is:weapon slot:kinetic — both must match", () => {
    const pred = parseQuery("is:weapon slot:kinetic");
    expect(
      pred(makeItem({ itemType: 3, slot: "Kinetic" }), noTags)
    ).toBe(true);
    expect(
      pred(makeItem({ itemType: 3, slot: "Energy" }), noTags)
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Compound: OR
// ---------------------------------------------------------------------------

describe("OR", () => {
  test("is:exotic or is:legendary — either match", () => {
    const pred = parseQuery("is:exotic or is:legendary");
    expect(pred(makeItem({ tier: "Exotic" }), noTags)).toBe(true);
    expect(pred(makeItem({ tier: "Legendary" }), noTags)).toBe(true);
    expect(pred(makeItem({ tier: "Rare" }), noTags)).toBe(false);
  });

  test("OR with different qualifiers", () => {
    const pred = parseQuery("is:vault or is:equipped");
    expect(pred(makeItem({ location: "vault", isEquipped: false }), noTags)).toBe(true);
    expect(pred(makeItem({ location: "char-1", isEquipped: true }), noTags)).toBe(true);
    expect(pred(makeItem({ location: "char-1", isEquipped: false }), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Negation
// ---------------------------------------------------------------------------

describe("negation", () => {
  test("-is:exotic excludes exotics", () => {
    const pred = parseQuery("-is:exotic");
    expect(pred(makeItem({ tier: "Exotic" }), noTags)).toBe(false);
    expect(pred(makeItem({ tier: "Legendary" }), noTags)).toBe(true);
  });

  test("not:is:locked excludes locked items", () => {
    const pred = parseQuery("not:is:locked");
    expect(pred(makeItem({ isLocked: true }), noTags)).toBe(false);
    expect(pred(makeItem({ isLocked: false }), noTags)).toBe(true);
  });

  test("-tag:trash excludes tagged items", () => {
    const pred = parseQuery("-tag:trash");
    expect(pred(makeItem(), ["trash"])).toBe(false);
    expect(pred(makeItem(), ["god-roll"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unknown qualifier
// ---------------------------------------------------------------------------

describe("unknown qualifier", () => {
  test("bogus:value returns false", () => {
    const pred = parseQuery("bogus:value");
    expect(pred(makeItem(), noTags)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Empty query
// ---------------------------------------------------------------------------

describe("empty query", () => {
  test("empty string matches all", () => {
    const pred = parseQuery("");
    expect(pred(makeItem(), noTags)).toBe(true);
  });

  test("whitespace-only matches all", () => {
    const pred = parseQuery("   ");
    expect(pred(makeItem(), noTags)).toBe(true);
  });
});
