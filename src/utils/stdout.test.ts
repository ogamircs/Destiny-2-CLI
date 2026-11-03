import { describe, expect, test } from "bun:test";
import { writeFully } from "./stdout.ts";

describe("writeFully", () => {
  test("keeps writing after a 64KiB pipe accepts only part of the buffer", () => {
    const payload = Buffer.from("x".repeat(70_000));
    const accepted: Buffer[] = [];
    writeFully((buffer, offset) => {
      const size = Math.min(65_536, buffer.length - offset);
      accepted.push(Buffer.from(buffer.subarray(offset, offset + size)));
      return size;
    }, payload);

    expect(Buffer.concat(accepted).equals(payload)).toBe(true);
    expect(accepted.length).toBe(2);
  });

  test("rejects a writer that accepts nothing", () => {
    expect(() => writeFully(() => 0, Buffer.from("abc"))).toThrow(/remaining stdout/);
  });
});
