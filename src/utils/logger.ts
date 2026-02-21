let verbose = false;

export function setVerbose(v: boolean) {
  verbose = v;
}

export function isVerbose(): boolean {
  return verbose;
}

export function debug(...args: unknown[]) {
  if (verbose) {
    console.error("[DEBUG]", ...args);
  }
}

export function warn(...args: unknown[]) {
  console.error("[WARN]", ...args);
}
