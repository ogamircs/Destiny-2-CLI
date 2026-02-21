import { describe, expect, test } from "bun:test";
import {
  className,
  genderName,
  kd,
  lightLevel,
  pct,
  raceName,
} from "./format.ts";

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, "");
}

describe("format", () => {
  test("maps class, race, and gender labels", () => {
    expect(className(0)).toBe("Titan");
    expect(className(99)).toBe("Unknown");
    expect(raceName(2)).toBe("Exo");
    expect(raceName(99)).toBe("Unknown");
    expect(genderName(1)).toBe("Female");
    expect(genderName(99)).toBe("Unknown");
  });

  test("formats percentages", () => {
    expect(pct(0.123)).toBe("12.3%");
    expect(pct(1)).toBe("100.0%");
  });

  test("formats KD values with two decimals", () => {
    expect(stripAnsi(kd(2))).toBe("2.00");
    expect(stripAnsi(kd(1.23))).toBe("1.23");
    expect(stripAnsi(kd(0.5))).toBe("0.50");
  });

  test("formats light level as numeric text", () => {
    expect(stripAnsi(lightLevel(2000))).toBe("2000");
    expect(stripAnsi(lightLevel(1850))).toBe("1850");
    expect(stripAnsi(lightLevel(1750))).toBe("1750");
  });
});
