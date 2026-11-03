import { getGame } from "./context.ts";

export const D1_ROLLS_REASON =
  "Roll appraisal and the perk finder use Destiny 2 socket plug sets and DIM wishlist hashes. Destiny 1 rolls live on talent grids, which those wishlists do not describe.";

export const D1_OPTIMIZER_REASON =
  "The optimizer scores Destiny 2 armor (mobility, resilience, recovery, discipline, intellect, strength) and wishlist sockets. Destiny 1 armor uses intellect, discipline, and strength on a different scale.";

export function assertDestiny2(feature: string, reason: string): void {
  if (getGame() !== "d1") return;
  throw new Error(`${feature} is not available for Destiny 1. ${reason}`);
}
