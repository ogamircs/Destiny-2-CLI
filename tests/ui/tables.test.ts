import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CharacterData } from "../../src/api/profile.ts";
import {
  formatStatValue,
  renderCharacterTable,
  renderInventoryTable,
  renderStatsTable,
  type DisplayItem,
} from "../../src/ui/tables.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

const originalLog = console.log;
const logs: string[] = [];

beforeEach(() => {
  logs.length = 0;
  console.log = (...args: unknown[]) => {
    logs.push(args.join(" "));
  };
});

afterEach(() => {
  console.log = originalLog;
});

describe("tables", () => {
  test("renderCharacterTable prints class and rank", () => {
    const chars: CharacterData[] = [
      {
        characterId: "1",
        membershipId: "m",
        membershipType: 3,
        dateLastPlayed: new Date(Date.now() - 60_000).toISOString(),
        minutesPlayedTotal: "180",
        light: 2000,
        classType: 1,
        raceType: 1,
        genderType: 0,
        stats: {},
        emblemPath: "",
        emblemBackgroundPath: "",
      },
    ];

    renderCharacterTable(chars, 8);
    const output = stripAnsi(logs.join("\n"));
    expect(output).toContain("Characters");
    expect(output).toContain("Hunter");
    expect(output).toContain("Rank 8");
  });

  test("renderInventoryTable groups by slot and marks equipped", () => {
    const items: DisplayItem[] = [
      {
        name: "Ace of Spades",
        tier: "Exotic",
        slot: "Kinetic",
        hash: 1,
        quantity: 1,
        isEquipped: true,
        location: "Hunter",
        instanceId: "10",
      },
      {
        name: "Funnelweb",
        tier: "Legendary",
        slot: "Energy",
        hash: 2,
        quantity: 2,
        isEquipped: false,
        location: "Hunter",
        instanceId: "11",
      },
    ];

    renderInventoryTable(items, "Hunter");
    const output = stripAnsi(logs.join("\n"));
    expect(output).toContain("Hunter");
    expect(output).toContain("Kinetic");
    expect(output).toContain("Energy");
    expect(output).toContain("Ace of Spades");
    expect(output).toContain("● ");
  });

  test("renderStatsTable prints stat/value rows", () => {
    renderStatsTable(
      [
        { name: "Kills", value: "1000" },
        { name: "K/D Ratio", value: "1.50" },
      ],
      "Account Stats"
    );

    const output = stripAnsi(logs.join("\n"));
    expect(output).toContain("Account Stats");
    expect(output).toContain("Kills");
    expect(output).toContain("1.50");
  });

  test("formatStatValue formats ratio and pct stats", () => {
    expect(stripAnsi(formatStatValue("killsDeathsRatio", 2.1, "2.10"))).toBe(
      "2.10"
    );
    expect(stripAnsi(formatStatValue("winLossRatio", 0.72, "0.72"))).toBe(
      "72.0%"
    );
    expect(formatStatValue("kills", 25, "25")).toBe("25");
  });

  test("render helpers no-op for empty arrays", () => {
    renderInventoryTable([], "Empty");
    renderStatsTable([], "Empty");
    expect(logs.length).toBe(0);
  });
});
