export interface ParsedEnvAssignment {
  key: string;
  value: string;
}

const ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseEnvLine(line: string): ParsedEnvAssignment | null {
  let trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  if (trimmed.startsWith("export ")) {
    trimmed = trimmed.slice("export ".length).trim();
  }

  const eqIdx = trimmed.indexOf("=");
  if (eqIdx <= 0) return null;

  const key = trimmed.slice(0, eqIdx).trim();
  if (!ENV_KEY.test(key)) return null;

  let value = trimmed.slice(eqIdx + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  } else {
    const commentIdx = value.search(/\s+#/);
    if (commentIdx !== -1) {
      value = value.slice(0, commentIdx).trim();
    }
  }

  return { key, value };
}

export function applyEnv(
  text: string,
  env: Record<string, string | undefined> = process.env
): void {
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (!env[parsed.key]) {
      env[parsed.key] = parsed.value;
    }
  }
}
