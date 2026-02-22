import { transferItem, equipItem } from "../api/inventory.ts";
import { debug } from "../utils/logger.ts";
import type { IndexedItem, InventoryIndex } from "./item-index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MoveStepType = "to_vault" | "from_vault" | "equip";

export interface MoveStep {
  type: MoveStepType;
  item: IndexedItem;
  fromCharacterId: string | undefined;
  toCharacterId: string | undefined;
  count: number;
  description: string;
}

export interface MovePlan {
  steps: MoveStep[];
  isValid: boolean;
  errors: string[];
}

export type MoveDestination =
  | { type: "vault" }
  | { type: "character"; characterId: string };

export interface MoveOptions {
  dryRun?: boolean;
  count?: number;
}

// ---------------------------------------------------------------------------
// planMove
// ---------------------------------------------------------------------------

export function planMove(
  item: IndexedItem,
  destination: MoveDestination,
  _index: InventoryIndex,
  options?: { count?: number }
): MovePlan {
  const count = options?.count ?? item.quantity;
  const errors: string[] = [];

  // Validation (in order)
  if (item.nonTransferrable) {
    errors.push(`${item.name} cannot be transferred`);
  } else if (item.isLocked) {
    errors.push(`${item.name} is locked. Unlock it in-game first.`);
  } else if (item.isEquipped) {
    errors.push(`${item.name} is equipped. Unequip it first.`);
  } else if (destination.type === "vault" && item.location === "vault") {
    errors.push("Item is already in the vault");
  } else if (
    destination.type === "character" &&
    item.location === destination.characterId
  ) {
    errors.push("Item is already on that character");
  }

  if (errors.length > 0) {
    return { steps: [], isValid: false, errors };
  }

  // Step generation
  const steps: MoveStep[] = [];

  if (item.location === "vault" && destination.type === "character") {
    // vault → character
    steps.push({
      type: "from_vault",
      item,
      fromCharacterId: undefined,
      toCharacterId: destination.characterId,
      count,
      description: `Move ${item.name} from vault to character ${destination.characterId}`,
    });
  } else if (item.location !== "vault" && destination.type === "vault") {
    // character → vault
    steps.push({
      type: "to_vault",
      item,
      fromCharacterId: item.location,
      toCharacterId: undefined,
      count,
      description: `Move ${item.name} from character ${item.location} to vault`,
    });
  } else if (item.location !== "vault" && destination.type === "character") {
    // character A → character B (two-hop via vault)
    const fromCharId = item.location;
    const toCharId = destination.characterId;
    steps.push({
      type: "to_vault",
      item,
      fromCharacterId: fromCharId,
      toCharacterId: undefined,
      count,
      description: `Move ${item.name} from character ${fromCharId} to vault`,
    });
    steps.push({
      type: "from_vault",
      item,
      fromCharacterId: undefined,
      toCharacterId: toCharId,
      count,
      description: `Move ${item.name} from vault to character ${toCharId}`,
    });
  }

  return { steps, isValid: true, errors: [] };
}

// ---------------------------------------------------------------------------
// executePlan
// ---------------------------------------------------------------------------

export async function executePlan(
  plan: MovePlan,
  options?: { onStep?: (step: MoveStep, index: number, total: number) => void }
): Promise<void> {
  if (!plan.isValid) {
    throw new Error(`Cannot execute invalid plan: ${plan.errors.join(", ")}`);
  }

  const total = plan.steps.length;
  for (let i = 0; i < total; i++) {
    const step = plan.steps[i]!;
    debug(`Executing step ${i + 1}/${total}: ${step.description}`);
    options?.onStep?.(step, i, total);

    const instanceId = step.item.instanceId ?? "0";

    if (step.type === "to_vault") {
      await transferItem(
        step.item.hash,
        step.count,
        true,
        instanceId,
        step.fromCharacterId!
      );
    } else if (step.type === "from_vault") {
      await transferItem(
        step.item.hash,
        step.count,
        false,
        instanceId,
        step.toCharacterId!
      );
    } else if (step.type === "equip") {
      await equipItem(instanceId, step.toCharacterId!);
    }
  }
}

// ---------------------------------------------------------------------------
// moveItem (convenience wrapper)
// ---------------------------------------------------------------------------

export async function moveItem(
  item: IndexedItem,
  destination: MoveDestination,
  index: InventoryIndex,
  options?: MoveOptions & {
    onStep?: (step: MoveStep, index: number, total: number) => void;
  }
): Promise<MovePlan> {
  const plan = planMove(item, destination, index, { count: options?.count });

  if (!plan.isValid) {
    return plan;
  }

  if (!options?.dryRun) {
    await executePlan(plan, { onStep: options?.onStep });
  }

  return plan;
}
