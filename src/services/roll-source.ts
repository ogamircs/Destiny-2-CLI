import { homedir } from "os";
import { join } from "path";
import {
  getRollSource,
  saveRollSource,
  updateRollSourceCache,
  type RollSourceKind,
  type RollSourceState,
} from "./local-db.ts";
import { parseWishlist, type Wishlist } from "./wishlist.ts";

const ROLL_SOURCE_PRESETS = {
  voltron:
    "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt",
  choosy:
    "https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/choosy_voltron.txt",
} as const;

export interface ResolvedRollSource {
  sourceInput: string;
  sourceResolved: string;
  sourceKind: RollSourceKind;
}

export interface RefreshedRollSource {
  state: RollSourceState;
  wishlist: Wishlist;
  usedCache: boolean;
  refreshError?: string;
}

export interface LoadedAppraiseWishlist {
  wishlist: Wishlist;
  sourceLabel: string;
  usedCache: boolean;
  cacheUpdatedAt: number | null;
  refreshError?: string;
}

function expandHomePath(pathValue: string): string {
  if (pathValue === "~") {
    return homedir();
  }

  if (pathValue.startsWith("~/")) {
    return join(homedir(), pathValue.slice(2));
  }

  return pathValue;
}

function parseAndValidateWishlist(text: string, _sourceLabel: string): Wishlist {
  return parseWishlist(text);
}

async function loadSourceText(source: ResolvedRollSource): Promise<string> {
  if (source.sourceKind === "url") {
    const response = await fetch(source.sourceResolved);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch wishlist from ${source.sourceResolved}: HTTP ${response.status}`
      );
    }
    return response.text();
  }

  const file = Bun.file(source.sourceResolved);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Wishlist file not found: ${source.sourceResolved}`);
  }

  return file.text();
}

export function resolveRollSource(source: string): ResolvedRollSource {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error("Source cannot be empty");
  }

  const preset =
    ROLL_SOURCE_PRESETS[trimmed.toLowerCase() as keyof typeof ROLL_SOURCE_PRESETS];

  if (preset) {
    return {
      sourceInput: trimmed.toLowerCase(),
      sourceResolved: preset,
      sourceKind: "url",
    };
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return {
      sourceInput: trimmed,
      sourceResolved: trimmed,
      sourceKind: "url",
    };
  }

  return {
    sourceInput: trimmed,
    sourceResolved: expandHomePath(trimmed),
    sourceKind: "file",
  };
}

export async function setRollSourceAndRefresh(source: string): Promise<{
  state: RollSourceState;
  wishlist: Wishlist;
}> {
  const resolved = resolveRollSource(source);
  const text = await loadSourceText(resolved);
  const wishlist = parseAndValidateWishlist(text, resolved.sourceInput);

  saveRollSource(
    resolved.sourceInput,
    resolved.sourceResolved,
    resolved.sourceKind,
    text
  );

  const state = getRollSource();
  if (!state) {
    throw new Error("Failed to persist roll source state");
  }

  return { state, wishlist };
}

export async function refreshRollSourceWithFallback(): Promise<RefreshedRollSource> {
  const state = getRollSource();
  if (!state) {
    throw new Error(
      "No roll source configured. Run: destiny rolls source set <voltron|choosy|url|file>"
    );
  }

  const resolved: ResolvedRollSource = {
    sourceInput: state.sourceInput,
    sourceResolved: state.sourceResolved,
    sourceKind: state.sourceKind,
  };

  try {
    const text = await loadSourceText(resolved);
    const wishlist = parseAndValidateWishlist(text, state.sourceInput);
    updateRollSourceCache(text);

    return {
      state: getRollSource() ?? state,
      wishlist,
      usedCache: false,
    };
  } catch (err) {
    if (!state.cacheText) {
      if (err instanceof Error) {
        throw new Error(`Failed to refresh roll source: ${err.message}`);
      }
      throw err;
    }

    return {
      state,
      wishlist: parseAndValidateWishlist(
        state.cacheText,
        `${state.sourceInput} (cached)`
      ),
      usedCache: true,
      refreshError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function loadWishlistForAppraise(
  sourceArg: string | undefined
): Promise<LoadedAppraiseWishlist> {
  if (sourceArg) {
    const resolved = resolveRollSource(sourceArg);
    const text = await loadSourceText(resolved);

    return {
      wishlist: parseAndValidateWishlist(text, resolved.sourceInput),
      sourceLabel: resolved.sourceInput,
      usedCache: false,
      cacheUpdatedAt: null,
    };
  }

  const refreshed = await refreshRollSourceWithFallback();

  return {
    wishlist: refreshed.wishlist,
    sourceLabel: refreshed.state.sourceInput,
    usedCache: refreshed.usedCache,
    cacheUpdatedAt: refreshed.state.cacheUpdatedAt,
    refreshError: refreshed.refreshError,
  };
}
