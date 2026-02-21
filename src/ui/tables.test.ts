import { describe, expect, test } from "bun:test";
import { formatStatValue } from "./tables.ts";

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

describe("formatStatValue", () => {
  test("uses KD formatting for ratio-like stats", () => {
    expect(stripAnsi(formatStatValue("killsDeathsRatio", 1.2345, "n/a"))).toBe(
      "1.23"
    );
    expect(
      stripAnsi(formatStatValue("killsDeathsAssists", 0.777, "n/a"))
    ).toBe("0.78");
    expect(stripAnsi(formatStatValue("efficiency", 2.111, "n/a"))).toBe(
      "2.11"
    );
  });

  test("uses percent formatting for win/loss ratio", () => {
    expect(formatStatValue("winLossRatio", 0.456, "n/a")).toBe("45.6%");
  });

  test("falls back to display value for unhandled stats", () => {
    expect(formatStatValue("score", 999, "999")).toBe("999");
  });
});
