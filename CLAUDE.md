# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Runtime

Use Bun instead of Node.js for everything: `bun run`, `bun test`, `bun build`, `bun install`.

## Commands

```bash
bun run src/index.ts        # run CLI in dev mode
bun run --watch src/index.ts # dev mode with file watching
bun run scripts/build.ts    # compile to ./destiny binary (bun-darwin-arm64)
bun test                    # run all tests
bun test src/path/to.test.ts # run a single test file
bun test --watch            # test watch mode
```

## Environment

Create a `.env` file with:
```
BUNGIE_API_KEY=...
BUNGIE_CLIENT_ID=...
BUNGIE_CLIENT_SECRET=...
```

Bun loads `.env` automatically. The OAuth callback requires a self-signed TLS cert, which is auto-generated on first login via `openssl`. The OAuth server runs on `https://localhost:3847`.

## Architecture

### Request flow

`src/index.ts` → loads `.env` → `src/cli.ts` (registers Commander subcommands) → `src/commands/*.ts`

Each command file exports a `register*Command(program)` function. Commands call into `src/api/` for Bungie API access and `src/services/` for local state.

### Config split (important)

`src/services/config.ts` has two distinct functions:
- `getLocalPaths()` — returns file paths only, no API keys required. Used by `token-store.ts` and `manifest-cache.ts` so `auth status` and `auth logout` work without env vars.
- `getConfig()` — requires `BUNGIE_API_KEY`, `BUNGIE_CLIENT_ID`, `BUNGIE_CLIENT_SECRET` to be set. Throws with a descriptive message if missing.

### API layer (`src/api/`)

- `client.ts` — the only file that makes HTTP requests. Handles: sliding window rate limiter (25 req/s), automatic token refresh, Bungie's `ErrorCode !== 1` error convention, HTTP 429 handling.
- `auth.ts` — token exchange and refresh with Bungie's OAuth endpoint.
- `profile.ts` — `getProfile(components[])` fetches profile data with `DestinyComponentType` flags.
- `inventory.ts` — `transferItem()` and `equipItem()` for item actions.
- `stats.ts` — activity history and stats aggregation.
- `manifest.ts` — fetches manifest version/URL only; the download/cache logic is in `services/manifest-cache.ts`.

`bungie-api-ts` is used **for TypeScript types only** — all actual HTTP calls go through the custom `apiRequest()` in `client.ts`.

### Services (`src/services/`)

- `token-store.ts` — XOR+base64 obfuscation of stored tokens. Key is derived from `$USER` and `process.arch`. Not cryptographically secure.
- `manifest-cache.ts` — downloads Bungie's SQLite manifest DB (served as a zip, extracted via system `unzip`), caches at `~/.cache/destiny-cli/`. Uses `bun:sqlite`. Item hashes from the API are unsigned 32-bit integers but stored as signed in SQLite — conversion happens in `lookupItem()`, `lookupBucket()`, and `lookupPerk()`.
- `auth-service.ts` — OAuth login flow: spins up a local `Bun.serve` HTTPS server on port 3847 with a self-signed cert, opens the browser via `open`, waits for the callback, then fetches membership info and saves tokens.
- `item-index.ts` — `buildInventoryIndex(profile, characters)` merges profile API data + manifest + item instances into a flat `IndexedItem[]` with O(1) lookup maps (`byInstanceId`, `byHash`, `byCharacter`, `vaultItems`). Populates `perks[]` when component 302 (ItemPerks) is included.
- `local-db.ts` — SQLite at `~/.config/destiny-cli/local.db`. Stores tags, notes, loadouts, and saved searches. `getLocalPaths()` (no API keys) is used so tag/note commands work without env vars. `getAllTags()` bulk-fetches all tags in one query.
- `move-planner.ts` — `planMove()` validates a transfer and returns typed steps; `executePlan()` runs them. Handles the two-hop vault relay for char→char transfers. Used by `transfer.ts` and `farming.ts`.
- `search.ts` — `parseQuery(query)` returns a `(item, tags[]) => boolean` predicate. Supports `is:`, `tag:`, `slot:`, `tier:`, `power:`, `class:`, bare text, AND (implicit space), OR keyword, and `-`/`not:` negation.
- `wishlist.ts` — `parseWishlist(text)` and `loadWishlist(source)` parse DIM-format wishlists. `gradeItem(hash, perks, wishlist)` returns `"god" | "good" | "trash" | "unknown"`.

### UI (`src/ui/`)

- `spinner.ts` — wraps `ora`; `withSpinner(label, fn)` is the primary helper.
- `tables.ts` — `cli-table3` wrappers for rendering item/character tables.
- `prompts.ts` — interactive `@clack/prompts` helpers: `pickItem`, `pickCharacter`, `pickDestination`, `confirm`.
- `format.ts` — pure formatting helpers: `className(classType)`, `success()`, `error()`.

### Error types (`src/utils/errors.ts`)

`AuthError`, `ApiError`, `RateLimitError`, `ManifestError` — all extend `Error`. `formatError(err)` produces human-readable strings for each type and is used at command boundaries.

### Transfer logic

Character-to-character transfers require two hops: char → vault → char. This is handled transparently in `src/commands/transfer.ts`.

### Constants (`src/utils/constants.ts`)

`DestinyComponentType` and `BucketHash` are the primary lookup tables. `BucketHash` maps slot names to Bungie's numeric bucket identifiers.
