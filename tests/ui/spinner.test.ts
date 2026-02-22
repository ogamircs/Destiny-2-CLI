import { afterAll, describe, expect, test, mock } from "bun:test";

let started = false;
let succeeded = false;
let failed = false;
let receivedText = "";

const spinner = {
  text: "",
  start() {
    started = true;
    return this;
  },
  succeed() {
    succeeded = true;
    return this;
  },
  fail() {
    failed = true;
    return this;
  },
};

mock.module("ora", () => ({
  default: (opts: { text: string }) => {
    receivedText = opts.text;
    return spinner;
  },
}));

const { createSpinner, withSpinner } = await import("../../src/ui/spinner.ts");

describe("spinner helpers", () => {
  test("createSpinner passes text to ora", () => {
    started = false;
    succeeded = false;
    failed = false;
    receivedText = "";

    const s = createSpinner("Loading data");
    expect(s).toBe(spinner as unknown);
    expect(receivedText).toBe("Loading data");
  });

  test("withSpinner succeeds when fn resolves", async () => {
    started = false;
    succeeded = false;
    failed = false;

    const value = await withSpinner("Working...", async () => 123);
    expect(value).toBe(123);
    expect(started).toBe(true);
    expect(succeeded).toBe(true);
    expect(failed).toBe(false);
  });

  test("withSpinner fails when fn throws", async () => {
    started = false;
    succeeded = false;
    failed = false;

    await expect(
      withSpinner("Working...", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(started).toBe(true);
    expect(succeeded).toBe(false);
    expect(failed).toBe(true);
  });
});

afterAll(() => {
  mock.restore();
});
