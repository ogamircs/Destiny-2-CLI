// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WishlistEntry {
  itemHash: number;
  perkHashes: number[];
  notes: string;
}

export interface Wishlist {
  title: string;
  entries: WishlistEntry[];
  byItemHash: Map<number, WishlistEntry[]>;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseWishlist(text: string): Wishlist {
  let title = "Wishlist";
  const entries: WishlistEntry[] = [];
  const byItemHash = new Map<number, WishlistEntry[]>();

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (!line) continue;

    // Title
    if (line.startsWith("title:")) {
      title = line.slice(6).trim();
      continue;
    }

    // Comments
    if (line.startsWith("//")) continue;

    // DIM wishlist entry
    if (line.startsWith("dimwishlist:")) {
      const entry = parseDimEntry(line.slice(12));
      if (entry) {
        entries.push(entry);
        const existing = byItemHash.get(entry.itemHash) ?? [];
        existing.push(entry);
        byItemHash.set(entry.itemHash, existing);
      }
    }
    // Ignore other lines silently
  }

  return { title, entries, byItemHash };
}

function parseDimEntry(payload: string): WishlistEntry | null {
  // Split off notes: `&notes:` is not a standard URL param separator
  let notesText = "";
  const notesIdx = payload.indexOf("&notes:");
  if (notesIdx >= 0) {
    notesText = payload.slice(notesIdx + 7).trim();
    payload = payload.slice(0, notesIdx);
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(payload);
  } catch {
    return null;
  }

  const itemStr = params.get("item");
  if (!itemStr) return null;

  const itemHash = parseInt(itemStr, 10);
  if (isNaN(itemHash) || itemHash === -1) return null;

  const perksStr = params.get("perks") ?? "";
  const perkHashes: number[] = perksStr
    ? perksStr
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n))
    : [];

  return { itemHash, perkHashes, notes: notesText };
}

// ---------------------------------------------------------------------------
// loadWishlist
// ---------------------------------------------------------------------------

export async function loadWishlist(source: string): Promise<Wishlist> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch wishlist from ${source}: HTTP ${res.status}`
      );
    }
    const text = await res.text();
    return parseWishlist(text);
  }

  // File path
  const file = Bun.file(source);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Wishlist file not found: ${source}`);
  }
  const text = await file.text();
  return parseWishlist(text);
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export type WishlistGrade = "god" | "good" | "trash" | "unknown";

export function gradeItem(
  itemHash: number,
  itemPerks: number[] | undefined,
  wishlist: Wishlist
): WishlistGrade {
  const entries = wishlist.byItemHash.get(itemHash);
  if (!entries || entries.length === 0) return "unknown";

  const perks = itemPerks ?? [];

  for (const entry of entries) {
    // Empty perkHashes means any roll is good → god
    if (entry.perkHashes.length === 0) return "god";

    const allMatch = entry.perkHashes.every((ph) => perks.includes(ph));
    if (allMatch) return "god";
  }

  // Check for partial match across all entries
  for (const entry of entries) {
    const anyMatch = entry.perkHashes.some((ph) => perks.includes(ph));
    if (anyMatch) return "good";
  }

  return "trash";
}
