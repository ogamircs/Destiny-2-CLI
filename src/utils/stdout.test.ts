import { describe, expect, test } from "bun:test";
import { join } from "path";
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

  test("a piped console.log larger than 64KiB is not truncated", async () => {
    const bytes = 300_000;
    const script = [
      `import { installBlockingStdout } from ${JSON.stringify(join(import.meta.dir, "stdout.ts"))};`,
      "installBlockingStdout();",
      `console.log("x".repeat(${bytes}));`,
    ].join("\n");
    const proc = Bun.spawn(["bun", "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(output.length).toBe(bytes + 1);
    expect(output.endsWith("\n")).toBe(true);
  });
});
