#!/usr/bin/env bun
import { createProgram } from "./cli.ts";
import { hoistGlobalArgs } from "./cli-args.ts";
import { formatError } from "./utils/errors.ts";
import { applyEnv } from "./utils/env.ts";
import { installBlockingStdout } from "./utils/stdout.ts";
import chalk from "chalk";

// Piped stdout (inventory --json | jq) otherwise stops at the 64 KiB pipe
// buffer when the process exits before the rest is flushed.
installBlockingStdout();

// Load .env file if present. Existing process env wins.
const envFile = Bun.file(".env");
if (await envFile.exists()) {
  applyEnv(await envFile.text());
}

const program = createProgram();

try {
  await program.parseAsync(hoistGlobalArgs(process.argv));
} catch (err) {
  console.error(chalk.red(formatError(err)));
  process.exit(1);
}
