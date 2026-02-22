import { describe, expect, test, mock, afterAll } from "bun:test";
import type { IndexedItem, InventoryIndex } from "./item-index.ts";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const transferItemMock = mock(async () => {});
const equipItemMock = mock(async () => {});

mock.module("../api/inventory.ts", () => ({
  transferItem: transferItemMock,
  equipItem: equipItemMock,
}));

afterAll(() => mock.restore());

// Import after mocks
const { planMove, executePlan, moveItem } = await import(
  `./move-planner.ts?test=${Date.now()}`
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CHAR_A = "char-aaa";
const CHAR_B = "char-bbb";

function makeItem(overrides: Partial<IndexedItem> = {}): IndexedItem {
  return {
    hash: 12345,
    instanceId: "inst-001",
    quantity: 1,
    bucketHash: 1498876634,
    transferStatus: 0,
    isLocked: false,
    name: "Test Weapon",
    itemType: 3,
    itemSubType: 6,
    tier: "Legendary",
    slot: "Kinetic",
    classRestriction: -1,
    icon: "",
    maxStackSize: 1,
    nonTransferrable: false,
    equippable: true,
    power: 1800,
    damageType: 2,
    energyCapacity: undefined,
    energyUsed: undefined,
    isEquipped: false,
    canEquip: true,
    location: CHAR_A,
    perks: undefined,
    ...overrides,
  };
}

function makeIndex(items: IndexedItem[] = []): InventoryIndex {
  return {
    all: items,
    byInstanceId: new Map(),
    byHash: new Map(),
    byCharacter: new Map(),
    vaultItems: [],
  };
}

function resetMocks() {
  transferItemMock.mockClear();
  equipItemMock.mockClear();
}

// ---------------------------------------------------------------------------
// planMove — validation errors
// ---------------------------------------------------------------------------
describe("planMove validation", () => {
  const idx = makeIndex();

  test("nonTransferrable item → error", () => {
    const item = makeItem({ nonTransferrable: true });
    const plan = planMove(item, { type: "vault" }, idx);
    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toBe("Test Weapon cannot be transferred");
    expect(plan.steps).toHaveLength(0);
  });

  test("locked item → error", () => {
    const item = makeItem({ isLocked: true });
    const plan = planMove(item, { type: "vault" }, idx);
    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toBe(
      "Test Weapon is locked. Unlock it in-game first."
    );
  });

  test("equipped item → error", () => {
    const item = makeItem({ isEquipped: true });
    const plan = planMove(item, { type: "vault" }, idx);
    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toBe("Test Weapon is equipped. Unequip it first.");
  });

  test("item already in vault, dest=vault → error", () => {
    const item = makeItem({ location: "vault" });
    const plan = planMove(item, { type: "vault" }, idx);
    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toBe("Item is already in the vault");
  });

  test("item already on target character → error", () => {
    const item = makeItem({ location: CHAR_A });
    const plan = planMove(
      item,
      { type: "character", characterId: CHAR_A },
      idx
    );
    expect(plan.isValid).toBe(false);
    expect(plan.errors[0]).toBe("Item is already on that character");
  });
});

// ---------------------------------------------------------------------------
// planMove — step generation
// ---------------------------------------------------------------------------
describe("planMove step generation", () => {
  const idx = makeIndex();

  test("vault → character: 1 from_vault step with correct toCharacterId", () => {
    const item = makeItem({ location: "vault" });
    const plan = planMove(
      item,
      { type: "character", characterId: CHAR_A },
      idx
    );
    expect(plan.isValid).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.type).toBe("from_vault");
    expect(plan.steps[0]!.toCharacterId).toBe(CHAR_A);
    expect(plan.steps[0]!.fromCharacterId).toBeUndefined();
  });

  test("character → vault: 1 to_vault step with correct fromCharacterId", () => {
    const item = makeItem({ location: CHAR_A });
    const plan = planMove(item, { type: "vault" }, idx);
    expect(plan.isValid).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.type).toBe("to_vault");
    expect(plan.steps[0]!.fromCharacterId).toBe(CHAR_A);
    expect(plan.steps[0]!.toCharacterId).toBeUndefined();
  });

  test("character A → character B: 2 steps in correct order", () => {
    const item = makeItem({ location: CHAR_A });
    const plan = planMove(
      item,
      { type: "character", characterId: CHAR_B },
      idx
    );
    expect(plan.isValid).toBe(true);
    expect(plan.steps).toHaveLength(2);

    const [step1, step2] = plan.steps;
    expect(step1!.type).toBe("to_vault");
    expect(step1!.fromCharacterId).toBe(CHAR_A);

    expect(step2!.type).toBe("from_vault");
    expect(step2!.toCharacterId).toBe(CHAR_B);
  });
});

// ---------------------------------------------------------------------------
// executePlan
// ---------------------------------------------------------------------------
describe("executePlan", () => {
  test("calls transferItem with transferToVault=true for to_vault step", async () => {
    resetMocks();
    const item = makeItem({ location: CHAR_A, instanceId: "inst-tv" });
    const plan = planMove(item, { type: "vault" }, makeIndex());
    await executePlan(plan);

    expect(transferItemMock).toHaveBeenCalledTimes(1);
    expect(transferItemMock.mock.calls[0]).toEqual([
      item.hash,
      item.quantity,
      true,
      "inst-tv",
      CHAR_A,
    ]);
  });

  test("calls transferItem with transferToVault=false for from_vault step", async () => {
    resetMocks();
    const item = makeItem({ location: "vault", instanceId: "inst-fv" });
    const plan = planMove(
      item,
      { type: "character", characterId: CHAR_B },
      makeIndex()
    );
    await executePlan(plan);

    expect(transferItemMock).toHaveBeenCalledTimes(1);
    expect(transferItemMock.mock.calls[0]).toEqual([
      item.hash,
      item.quantity,
      false,
      "inst-fv",
      CHAR_B,
    ]);
  });

  test("throws on invalid plan", async () => {
    const item = makeItem({ nonTransferrable: true });
    const plan = planMove(item, { type: "vault" }, makeIndex());
    await expect(executePlan(plan)).rejects.toThrow(
      "Cannot execute invalid plan"
    );
  });

  test("onStep callback called for each step with correct index/total", async () => {
    resetMocks();
    const item = makeItem({ location: CHAR_A });
    const plan = planMove(
      item,
      { type: "character", characterId: CHAR_B },
      makeIndex()
    );

    const calls: Array<{ index: number; total: number; type: string }> = [];
    await executePlan(plan, {
      onStep: (step, index, total) => {
        calls.push({ index, total, type: step.type });
      },
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ index: 0, total: 2, type: "to_vault" });
    expect(calls[1]).toEqual({ index: 1, total: 2, type: "from_vault" });
  });

  test("instanceId fallback to '0' when undefined", async () => {
    resetMocks();
    const item = makeItem({ location: CHAR_A, instanceId: undefined });
    const plan = planMove(item, { type: "vault" }, makeIndex());
    await executePlan(plan);

    expect(transferItemMock.mock.calls[0]![3]).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// moveItem
// ---------------------------------------------------------------------------
describe("moveItem", () => {
  test("dryRun: true never calls transferItem", async () => {
    resetMocks();
    const item = makeItem({ location: CHAR_A });
    const plan = await moveItem(item, { type: "vault" }, makeIndex(), {
      dryRun: true,
    });
    expect(transferItemMock).not.toHaveBeenCalled();
    expect(plan.isValid).toBe(true);
  });

  test("count propagates to transferItem stackSize", async () => {
    resetMocks();
    const item = makeItem({
      location: CHAR_A,
      quantity: 10,
      instanceId: undefined,
    });
    await moveItem(item, { type: "vault" }, makeIndex(), { count: 5 });

    expect(transferItemMock.mock.calls[0]![1]).toBe(5);
  });

  test("returns invalid plan without calling API", async () => {
    resetMocks();
    const item = makeItem({ isLocked: true });
    const plan = await moveItem(item, { type: "vault" }, makeIndex());
    expect(plan.isValid).toBe(false);
    expect(transferItemMock).not.toHaveBeenCalled();
  });
});
