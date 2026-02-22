import { describe, expect, test } from "bun:test";
import {
  className,
  dim,
  error,
  genderName,
  header,
  kd,
  lightLevel,
  pct,
  raceName,
  success,
  tierLabel,
  timeSince,
} from "../../src/ui/format.ts";

function stripAnsi(text: string): string {
  return text.replace(/\x1B\[[0-9;]*m/g, "");
}

describe("ui format helpers", () => {
  test("maps class/race/gender names", () => {
    expect(className(0)).toBe("Titan");
    expect(className(99)).toBe("Unknown");
    expect(raceName(1)).toBe("Awoken");
    expect(raceName(99)).toBe("Unknown");
    expect(genderName(0)).toBe("Male");
    expect(genderName(99)).toBe("Unknown");
  });

  test("formats percentages and kd", () => {
    expect(pct(0.523)).toBe("52.3%");
    expect(stripAnsi(kd(2.345))).toBe("2.35");
    expect(stripAnsi(kd(0.8))).toBe("0.80");
  });

  test("formats labeled output", () => {
    expect(stripAnsi(header("Title"))).toBe("Title");
    expect(stripAnsi(dim("note"))).toBe("note");
    expect(stripAnsi(success("done"))).toBe("✓ done");
    expect(stripAnsi(error("failed"))).toBe("✗ failed");
    expect(stripAnsi(tierLabel("Legendary"))).toBe("Legendary");
  });

  test("formats light level", () => {
    expect(stripAnsi(lightLevel(2001))).toBe("2001");
    expect(stripAnsi(lightLevel(1801))).toBe("1801");
    expect(stripAnsi(lightLevel(1700))).toBe("1700");
  });

  test("formats recent time deltas", () => {
    const now = Date.now();
    const tenMinutesAgo = new Date(now - 10 * 60_000).toISOString();
    const twoHoursAgo = new Date(now - 2 * 60 * 60_000).toISOString();
    const fiveDaysAgo = new Date(now - 5 * 24 * 60 * 60_000).toISOString();

    expect(timeSince(tenMinutesAgo)).toBe("10m ago");
    expect(timeSince(twoHoursAgo)).toBe("2h ago");
    expect(timeSince(fiveDaysAgo)).toBe("5d ago");
  });
});
