#!/usr/bin/env bun
import { createProgram } from "./cli.ts";
import { formatError } from "./utils/errors.ts";
import chalk from "chalk";

// Load .env file if present
const envFile = Bun.file(".env");
if (await envFile.exists()) {
  const envText = await envFile.text();
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const program = createProgram();

try {
  await program.parseAsync(process.argv);
} catch (err) {
  console.error(chalk.red(formatError(err)));
  process.exit(1);
}
