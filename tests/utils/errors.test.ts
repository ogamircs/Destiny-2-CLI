import { describe, expect, test } from "bun:test";
import {
  ApiError,
  AuthError,
  ManifestError,
  RateLimitError,
  formatError,
} from "../../src/utils/errors.ts";

describe("error classes", () => {
  test("AuthError sets name and message", () => {
    const err = new AuthError("bad auth");
    expect(err.name).toBe("AuthError");
    expect(err.message).toBe("bad auth");
  });

  test("ApiError sets status and optional code", () => {
    const err = new ApiError("api failed", 503, 1234);
    expect(err.name).toBe("ApiError");
    expect(err.statusCode).toBe(503);
    expect(err.errorCode).toBe(1234);
  });

  test("RateLimitError extends ApiError with retryAfter", () => {
    const err = new RateLimitError(7);
    expect(err.name).toBe("RateLimitError");
    expect(err.statusCode).toBe(429);
    expect(err.retryAfter).toBe(7);
  });

  test("ManifestError sets name", () => {
    const err = new ManifestError("manifest failed");
    expect(err.name).toBe("ManifestError");
    expect(err.message).toBe("manifest failed");
  });
});

describe("formatError", () => {
  test("formats AuthError", () => {
    expect(formatError(new AuthError("bad token"))).toBe(
      "Auth error: bad token"
    );
  });

  test("formats RateLimitError", () => {
    expect(formatError(new RateLimitError(5))).toBe("Rate limited — retry in 5s");
  });

  test("formats ApiError", () => {
    expect(formatError(new ApiError("upstream", 500))).toBe(
      "API error (500): upstream"
    );
  });

  test("formats generic Error", () => {
    expect(formatError(new Error("oops"))).toBe("oops");
  });

  test("formats unknown values", () => {
    expect(formatError(42)).toBe("42");
  });
});
