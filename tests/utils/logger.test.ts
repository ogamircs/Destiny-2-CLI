import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { debug, isVerbose, setVerbose, warn } from "../../src/utils/logger.ts";

const originalError = console.error;
const calls: unknown[][] = [];

beforeEach(() => {
  calls.length = 0;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };
  setVerbose(false);
});

afterEach(() => {
  console.error = originalError;
  setVerbose(false);
});

describe("logger", () => {
  test("toggles verbose mode", () => {
    expect(isVerbose()).toBe(false);
    setVerbose(true);
    expect(isVerbose()).toBe(true);
  });

  test("debug logs only when verbose", () => {
    debug("hidden");
    expect(calls.length).toBe(0);

    setVerbose(true);
    debug("visible", 1);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual(["[DEBUG]", "visible", 1]);
  });

  test("warn always logs", () => {
    warn("careful");
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual(["[WARN]", "careful"]);
  });
});
