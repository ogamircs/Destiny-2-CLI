import Table from "cli-table3";
import chalk from "chalk";
import { colorByTier, className, raceName, genderName, timeSince, header, kd, pct } from "./format.ts";
import type { CharacterData } from "../api/profile.ts";
import { BUCKET_SLOT_NAMES } from "../utils/constants.ts";

export interface DisplayItem {
  name: string;
  tier: string;
  slot: string;
  instanceId?: string;
  hash: number;
  quantity: number;
  isEquipped: boolean;
  location: string; // character name or "Vault"
}

export function renderCharacterTable(characters: CharacterData[], guardianRank?: number) {
  const table = new Table({
    head: [
      chalk.bold("Class"),
      chalk.bold("Race/Gender"),
      chalk.bold("Rank"),
      chalk.bold("Last Played"),
      chalk.bold("Time Played"),
    ],
    style: { head: [], border: ["dim"] },
  });

  for (const char of characters) {
    table.push([
      chalk.bold(className(char.classType)),
      `${raceName(char.raceType)} ${genderName(char.genderType)}`,
      guardianRank !== undefined ? chalk.cyan(`Rank ${guardianRank}`) : chalk.dim("—"),
      timeSince(char.dateLastPlayed),
      `${Math.floor(parseInt(char.minutesPlayedTotal) / 60)}h`,
    ]);
  }

  console.log(header("\nCharacters"));
  console.log(table.toString());
}

export function renderInventoryTable(
  items: DisplayItem[],
  title: string
) {
  if (items.length === 0) return;

  // Group by slot
  const bySlot = new Map<string, DisplayItem[]>();
  for (const item of items) {
    const slotItems = bySlot.get(item.slot) || [];
    slotItems.push(item);
    bySlot.set(item.slot, slotItems);
  }

  console.log(header(`\n${title}`));

  for (const [slot, slotItems] of bySlot) {
    const table = new Table({
      head: [
        chalk.bold(slot),
        chalk.bold("Tier"),
        chalk.bold("Qty"),
      ],
      style: { head: [], border: ["dim"] },
      colWidths: [44, 12, 6],
    });

    for (const item of slotItems) {
      const prefix = item.isEquipped ? chalk.green("● ") : "  ";
      table.push([
        prefix + colorByTier(item.name, item.tier),
        item.tier,
        item.quantity > 1 ? String(item.quantity) : "",
      ]);
    }

    console.log(table.toString());
  }
}

export interface StatRow {
  name: string;
  value: string;
}

export function renderStatsTable(
  stats: StatRow[],
  title: string
) {
  if (stats.length === 0) return;

  const table = new Table({
    head: [chalk.bold("Stat"), chalk.bold("Value")],
    style: { head: [], border: ["dim"] },
    colWidths: [30, 20],
  });

  for (const stat of stats) {
    table.push([stat.name, stat.value]);
  }

  console.log(header(`\n${title}`));
  console.log(table.toString());
}

export function formatStatValue(
  statId: string,
  value: number,
  displayValue: string
): string {
  switch (statId) {
    case "killsDeathsRatio":
    case "killsDeathsAssists":
    case "efficiency":
      return kd(value);
    case "winLossRatio":
      return pct(value);
    default:
      return displayValue;
  }
}
