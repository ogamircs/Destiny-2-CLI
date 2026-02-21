#!/usr/bin/env bun
import { $ } from "bun";

console.log("Building destiny CLI...");

await $`bun build ./src/index.ts --compile --outfile destiny --target bun-darwin-arm64`;

console.log("Build complete: ./destiny");
