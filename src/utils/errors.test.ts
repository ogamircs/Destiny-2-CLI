import { describe, expect, test } from "bun:test";
import {
  ApiError,
  AuthError,
  RateLimitError,
  formatError,
} from "./errors.ts";

describe("errors", () => {
  test("formats AuthError messages", () => {
    const err = new AuthError("missing token");
    expect(formatError(err)).toBe("Auth error: missing token");
  });

  test("formats RateLimitError messages", () => {
    const err = new RateLimitError(30);
    expect(formatError(err)).toBe("Rate limited — retry in 30s");
  });

  test("formats ApiError messages", () => {
    const err = new ApiError("Forbidden", 403, 1234);
    expect(formatError(err)).toBe("API error (403): Forbidden");
    expect(err.errorCode).toBe(1234);
  });

  test("formats generic Error messages", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });

  test("formats unknown values with String()", () => {
    expect(formatError(42)).toBe("42");
  });
});
