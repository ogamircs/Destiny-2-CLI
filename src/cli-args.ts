const BOOLEAN_GLOBALS = new Set(["--verbose"]);
const VALUE_GLOBALS = new Set(["--game", "--platform"]);

/**
 * Move global flags in front of the subcommand so Commander accepts them
 * either before or after the command name.
 */
export function hoistGlobalArgs(argv: string[]): string[] {
  if (argv.length < 3) return argv;
  const [node, script, ...args] = argv;
  const hoisted: string[] = [];
  const rest: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      rest.push(arg, ...args.slice(i + 1));
      break;
    }
    if (BOOLEAN_GLOBALS.has(arg)) {
      hoisted.push(arg);
      continue;
    }
    if (VALUE_GLOBALS.has(arg)) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        hoisted.push(arg);
        continue;
      }
      hoisted.push(arg, value);
      i += 1;
      continue;
    }
    if (arg.startsWith("--game=") || arg.startsWith("--platform=")) {
      hoisted.push(arg);
      continue;
    }
    rest.push(arg);
  }

  return [node!, script!, ...hoisted, ...rest];
}
