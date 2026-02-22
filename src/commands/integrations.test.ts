import { afterEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";

async function runCommand(
  register: (program: Command) => void,
  args: string[]
): Promise<{ logs: string[]; errors: string[]; exitCode: number | null }> {
  const logs: string[] = [];
  const errors: string[] = [];
  let exitCode: number | null = null;

  const origLog = console.log;
  const origError = console.error;
  const origExit = process.exit;

  console.log = (...v: unknown[]) => logs.push(v.map(String).join(" "));
  console.error = (...v: unknown[]) => errors.push(v.map(String).join(" "));
  (process as unknown as { exit: (code: number) => never }).exit = (
    code: number
  ) => {
    exitCode = code;
    throw new Error(`__exit_${code}__`);
  };

  try {
    const program = new Command();
    program.exitOverride();
    register(program);
    await program.parseAsync(["node", "destiny", ...args]);
  } catch (err: unknown) {
    const known = err as { message?: string; code?: string };
    if (!known.message?.startsWith("__exit_")) {
      if (
        known.code !== "commander.helpDisplayed" &&
        known.code !== "commander.unknownOption"
      ) {
        // swallow test harness errors
      }
    }
  } finally {
    console.log = origLog;
    console.error = origError;
    (process as unknown as { exit: typeof process.exit }).exit = origExit;
  }

  return { logs, errors, exitCode };
}

describe("integrations command scaffolding", () => {
  afterEach(() => mock.restore());

  test("streamdeck status shows deferred integration messaging", async () => {
    const { registerIntegrationsCommand } = await import(
      `./integrations.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerIntegrationsCommand, [
      "integrations",
      "streamdeck",
      "status",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) =>
        line.toLowerCase().includes("stream deck integration is deferred")
      )
    ).toBe(true);
  });

  test("streamdeck setup prints placeholder setup guidance", async () => {
    const { registerIntegrationsCommand } = await import(
      `./integrations.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerIntegrationsCommand, [
      "integrations",
      "streamdeck",
      "setup",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) =>
        line.toLowerCase().includes("placeholder setup scaffolding")
      )
    ).toBe(true);
  });

  test("packaging status prints platform packaging placeholders", async () => {
    const { registerIntegrationsCommand } = await import(
      `./integrations.ts?t=${Date.now()}-${Math.random()}`
    );

    const result = await runCommand(registerIntegrationsCommand, [
      "integrations",
      "packaging",
      "status",
    ]);

    expect(result.exitCode).toBeNull();
    expect(
      result.logs.some((line) => line.toLowerCase().includes("desktop packaging"))
    ).toBe(true);
    expect(
      result.logs.some((line) => line.toLowerCase().includes("mobile packaging"))
    ).toBe(true);
  });
});
