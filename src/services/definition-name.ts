const CODE_NAME = /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/;
const DROPPED_TOKENS = new Set([
  "faction",
  "factions",
  "event",
  "events",
  "progression",
  "progressions",
]);

export function isInternalCodeName(value: string): boolean {
  return CODE_NAME.test(value.trim());
}

export function humanizeCodeName(value: string): string {
  const parts = value.split("_").filter((part) => {
    if (!part) return false;
    if (DROPPED_TOKENS.has(part.toLowerCase())) return false;
    if (/^r\d+$/i.test(part) || /^s\d+$/i.test(part)) return false;
    return true;
  });
  const chosen = parts.length > 0 ? parts : value.split("_").filter(Boolean);
  return chosen
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function definitionDisplayName(data: Record<string, unknown>): string | null {
  const display = record(data.displayProperties);
  const summary = record(data.summary);
  const candidates = [
    text(display?.name),
    text(data.factionName),
    text(data.displayName),
    text(summary?.vendorName),
    text(data.itemName),
    text(data.name),
    text(data.identifier),
  ].filter((value) => value.length > 0);

  const readable = candidates.find((value) => !isInternalCodeName(value));
  if (readable) return readable;
  const code = candidates.find((value) => isInternalCodeName(value));
  if (code) return humanizeCodeName(code);
  return null;
}

export function htmlToText(value: string): string {
  const decoded = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  return decoded
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
