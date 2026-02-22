# Destiny 2 CLI

A macOS command-line tool for Destiny 2. View your characters, browse inventory, transfer items, tag and annotate gear, search with a query language, appraise rolls against wishlists, and check stats — all from the terminal.

## Requirements

- [Bun](https://bun.sh) v1.1+
- macOS (arm64 or x64)
- A Bungie API application (free — takes ~2 minutes to set up)

## Bungie API Setup

1. Go to [bungie.net/en/Application](https://www.bungie.net/en/Application) and click **Create New App**
2. Fill in the details:
   - **OAuth Client Type**: Confidential
   - **Redirect URL**: `https://localhost:3847/callback`
   - **Scope**: Read your Destiny 2 inventory and vault (check all read scopes)
3. After creating the app, copy your **API Key**, **OAuth client_id**, and **OAuth client_secret**

## Installation

```bash
# Clone the repo
git clone https://github.com/ogamircs/Destiny-2-CLI.git
cd Destiny-2-CLI

# Install dependencies
bun install

# Copy the env template and fill in your credentials
cp .env.example .env
```

Edit `.env`:

```env
BUNGIE_API_KEY=your_api_key_here
BUNGIE_CLIENT_ID=your_client_id_here
BUNGIE_CLIENT_SECRET=your_client_secret_here
```

## Usage

Run directly with Bun:

```bash
bun run src/index.ts <command>
```

Or build a standalone binary first (recommended):

```bash
bun run scripts/build.ts
# Produces ./destiny — move it anywhere on your PATH
```

Then use as:

```bash
destiny <command>
```

---

### Authentication

```bash
# Log in — opens your browser for Bungie OAuth
destiny auth login

# Check login status
destiny auth status

# Log out and clear stored credentials
destiny auth logout
```

### Characters

```bash
# List all your characters with class, Guardian Rank, and last played time
destiny characters
```

```
Characters
┌─────────┬─────────────┬────────┬─────────────┬─────────────┐
│ Class   │ Race/Gender │ Rank   │ Last Played │ Time Played │
├─────────┼─────────────┼────────┼─────────────┼─────────────┤
│ Hunter  │ Awoken Male │ Rank 7 │ 2h ago      │ 1842h       │
│ Titan   │ Human Male  │ Rank 7 │ 3d ago      │ 412h        │
│ Warlock │ Exo Female  │ Rank 7 │ 5d ago      │ 203h        │
└─────────┴─────────────┴────────┴─────────────┴─────────────┘
```

### Inventory

```bash
# View all items across all characters and vault
destiny inventory

# Filter to a specific character
destiny inventory --character hunter

# Show vault items only
destiny inventory --vault

# Filter by gear slot
destiny inventory --slot kinetic
destiny inventory --slot helmet

# Search by item name
destiny inventory --search "Ace of Spades"

# Output raw JSON
destiny inventory --json
```

Available slots: `kinetic`, `energy`, `power`, `helmet`, `gauntlets`, `chest`, `legs`, `class item`, `ghost`, `vehicle`, `ship`

### Transfer Items

```bash
# Transfer an item (interactive picker if multiple matches)
destiny transfer "Ace of Spades"

# Transfer to a specific destination
destiny transfer "Ace of Spades" --to vault
destiny transfer "Ace of Spades" --to hunter
destiny transfer "Exotic Cipher" --to titan

# Transfer a stack (for stackable items)
destiny transfer "Enhancement Core" --to vault --count 20
```

Character-to-character transfers are handled automatically via a two-hop vault transfer.

### Equip Items

```bash
# Equip an item (auto-transfers from vault or another character if needed)
destiny equip "Ace of Spades"

# Equip on a specific character
destiny equip "Ace of Spades" --character hunter
```

### Tags & Notes

Attach persistent tags and free-text notes to any item. These are stored locally and used by the `search` command.

```bash
# Tag an item
destiny tag add "Ace of Spades" god-roll
destiny tag add "Ace of Spades" pvp-main

# List tags on an item
destiny tag list "Ace of Spades"

# Remove a tag
destiny tag remove "Ace of Spades" pvp-main

# Attach a note
destiny note set "Ace of Spades" "save for trials"

# Show the note
destiny note show "Ace of Spades"

# Clear the note
destiny note clear "Ace of Spades"
```

### Search

Search your entire inventory — across all characters and the vault — using a structured query language.

```bash
# Basic queries
destiny search "is:exotic"
destiny search "is:weapon tier:legendary slot:kinetic"
destiny search "ace"                       # bare text matches item names

# Tag and power filters
destiny search "tag:god-roll"
destiny search "is:weapon power:>1800"
destiny search "is:armor power:>=1810 is:titan"

# Boolean operators
destiny search "is:exotic or is:legendary"
destiny search "is:weapon -is:exotic"      # negation with -
destiny search "not:is:locked is:vault"

# Output and saving
destiny search "is:exotic" --json
destiny search "is:weapon tier:exotic" --save exotic-weapons
destiny search --saved                     # list all saved queries
```

**Query syntax:**

| Qualifier | Examples | Matches |
|---|---|---|
| `is:weapon` / `is:armor` / `is:ghost` / … | `is:weapon` | item type |
| `is:exotic` / `is:legendary` / `is:rare` / … | `is:legendary` | tier |
| `is:equipped` / `is:locked` / `is:vault` | `is:equipped` | state |
| `is:solar` / `is:arc` / `is:void` / `is:strand` / `is:stasis` / `is:kinetic` | `is:solar` | damage type |
| `is:titan` / `is:hunter` / `is:warlock` | `is:titan` | class restriction |
| `tag:` | `tag:god-roll` | item has that tag |
| `slot:` | `slot:kinetic` | gear slot (case-insensitive) |
| `tier:` | `tier:exotic` | tier name (case-insensitive) |
| `power:` | `power:>1800`, `power:<=1750`, `power:1810` | power level comparison |
| `class:` | `class:titan`, `class:any` | class restriction |
| bare text | `ace` | name substring match |

Space = AND (implicit). `or` = lower-precedence OR. `-` or `not:` prefix = negate.

### Roll Appraisal

Grade your weapons against a DIM-format wishlist.

```bash
# Set a default source once, then appraise without --source
destiny rolls source set voltron
destiny rolls appraise

# Appraise all weapons against a local wishlist file
destiny rolls appraise --source ~/wishlists/pvp.txt

# Pull a wishlist from the web
destiny rolls appraise --source https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt

# Filter to one character's weapons
destiny rolls appraise --source ~/wishlist.txt --character hunter

# JSON output for scripting
destiny rolls appraise --source ~/wishlist.txt --json
```

Grades: **GOD** (all perk column matched), **GOOD** (partial match), **TRASH** (on wishlist but no perks match), **?** (not on wishlist).

Wishlists must be in [DIM format](https://github.com/48klocs/dim-wish-list-sources): `dimwishlist:item=HASH&perks=P1,P2&notes:...`

### Roll Source Management

Manage a default wishlist source with local cache + refresh timestamps.

```bash
# Set and cache default source (preset, URL, or file path)
destiny rolls source set voltron
destiny rolls source set choosy
destiny rolls source set ~/wishlists/pvp.txt

# Show current source, cache status, and timestamps
destiny rolls source show

# Refresh cache from source (falls back to cached copy on failure)
destiny rolls source refresh
```

### Roll Finder

Find weapons in the manifest that can roll a requested perk combination.

```bash
# Find hand cannons that can roll both perks
destiny rolls find --perk "Outlaw" --perk "Rampage" --archetype "hand cannon"

# JSON output
destiny rolls find --perk "Headstone" --perk "Demolitionist" --json
```

### Farming Mode

Clear a character's unequipped, unlocked items to the vault in one shot — then restore them when the farming session is done.

```bash
# Clear Hunter's inventory to vault (saves a recovery loadout first)
destiny farming start --character hunter

# Check active sessions (no API call)
destiny farming status

# Restore items back to Hunter
destiny farming stop --character hunter
```

The recovery loadout is saved before any items move, so `stop` can restore from partial failures.

### Loadouts v1

Save and apply equipment snapshots (item/equip state).

```bash
# Save currently equipped items from a character
destiny loadout create "raid-dps" --character warlock

# List saved loadouts
destiny loadout list

# Apply a loadout (auto-selects matching class if --character is omitted)
destiny loadout apply "raid-dps"

# Manage loadout files
destiny loadout export "raid-dps" --out ./raid-dps.json
destiny loadout import ./raid-dps.json --name "raid-dps-v2"
destiny loadout delete "raid-dps-v2"
```

### Stats

```bash
# View overall account stats
destiny stats

# Filter by activity mode
destiny stats --mode pvp
destiny stats --mode pve
destiny stats --mode raid
destiny stats --mode strikes
destiny stats --mode gambit
destiny stats --mode trials
destiny stats --mode ironbanner
destiny stats --mode dungeon
destiny stats --mode nightfall

# Filter to a specific character
destiny stats --mode pvp --character hunter

# Output raw JSON
destiny stats --json
```

---

## Global Options

```bash
# Enable verbose debug logging for any command
destiny --verbose <command>
```

## Building a Standalone Binary

```bash
bun run scripts/build.ts
```

This compiles to a self-contained `./destiny` binary targeting `bun-darwin-arm64`. Move it to `/usr/local/bin/destiny` (or anywhere on your `$PATH`) for system-wide access:

```bash
bun run scripts/build.ts && sudo mv destiny /usr/local/bin/destiny
```

## Testing

```bash
# Run all unit tests
bun test

# Watch mode for local iteration
bun test --watch
```

## Project Structure

```
src/
├── index.ts              # Entry point (.env loader + CLI runner)
├── cli.ts                # Commander program + command registration
├── commands/             # One file per subcommand
│   ├── auth.ts           # auth login/logout/status
│   ├── characters.ts     # characters
│   ├── inventory.ts      # inventory
│   ├── transfer.ts       # transfer / move
│   ├── equip.ts          # equip
│   ├── stats.ts          # stats
│   ├── tag.ts            # tag add/remove/list + note set/clear/show
│   ├── search.ts         # search DSL
│   ├── rolls.ts          # rolls appraise/find/source
│   ├── farming.ts        # farming start/stop/status
│   └── loadout.ts        # loadout create/list/apply/delete/export/import
├── api/                  # Thin fetch wrappers for Bungie API endpoints
├── services/             # Core services (see below)
│   ├── item-index.ts     # Merges profile + manifest + instance data into a flat index
│   ├── local-db.ts       # Persistent SQLite for tags, notes, loadouts, saved searches, roll source cache
│   ├── roll-source.ts    # Roll source preset resolution + cache refresh/fallback
│   ├── move-planner.ts   # Validates and plans item transfers before touching the API
│   ├── search.ts         # Query DSL parser
│   ├── wishlist.ts       # DIM wishlist parser + roll grader
│   ├── manifest-cache.ts # Manifest download, cache, and item/perk lookups
│   ├── token-store.ts    # Obfuscated token persistence
│   ├── auth-service.ts   # OAuth login flow
│   └── config.ts         # Path and config resolution
├── ui/                   # Tables, spinners, prompts, color formatters
└── utils/                # Constants, error types, debug logger
```

---

## Services Reference

The core services below are the foundation layer that all higher-level features build on. They can be imported directly for scripting or extension.

### `item-index.ts` — Inventory Index

Merges the Bungie profile API, the manifest SQLite database, and per-item instance data into a single flat `IndexedItem[]` with O(1) lookup maps.

```ts
import { buildInventoryIndex, getRequiredComponents } from "./src/services/item-index.ts";
import { getProfile } from "./src/api/profile.ts";

// Fetch profile with all required components in one call
const profile = await getProfile(getRequiredComponents());
const characters = Object.values(profile.characters?.data ?? {});

const idx = buildInventoryIndex(profile, characters);

// O(1) lookups
const item = idx.byInstanceId.get("6917530110795528798");
const allSwords = idx.byHash.get(someWeaponHash);
const warlockItems = idx.byCharacter.get(characterId);
const vaultWeapons = idx.vaultItems.filter(i => i.itemType === 3);

// Every IndexedItem has:
// item.name, item.slot, item.tier, item.power
// item.isLocked, item.isEquipped, item.nonTransferrable
// item.location  →  characterId string, or "vault"
// item.classRestriction  →  -1=any, 0=Titan, 1=Hunter, 2=Warlock
// item.perks  →  number[] of visible perk hashes (requires ItemPerks component)
```

To also fetch perk data (needed for roll appraisal), add `DestinyComponentType.ItemPerks` (302) to the components list.

`getRequiredComponents()` returns the baseline `DestinyComponentType` flags: `Characters(200)`, `CharacterInventories(201)`, `CharacterEquipment(205)`, `ProfileInventories(102)`, `ItemInstances(300)`.

---

### `local-db.ts` — Local Persistent Storage

A SQLite database at `~/.config/destiny-cli/local.db` for storing per-item annotations and saved configurations. Works without API keys.

#### Tags

```ts
import { addTag, removeTag, getTags, getAllTags } from "./src/services/local-db.ts";

const item = { instanceId: "6917530110795528798", hash: 12345 };

addTag(item, "junk");       // idempotent — safe to call multiple times
addTag(item, "infuse");
getTags(item);              // → ["infuse", "junk"]
removeTag(item, "junk");
getTags(item);              // → ["infuse"]

// Bulk fetch all tags (used by search to avoid N round-trips)
getAllTags();  // → Map<itemKey, string[]>
```

#### Notes

```ts
import { setNote, getNote, clearNote } from "./src/services/local-db.ts";

setNote(item, "save for the raid build");
getNote(item);   // → "save for the raid build"
clearNote(item);
getNote(item);   // → null
```

#### Loadouts

```ts
import { saveLoadout, getLoadout, listLoadouts, deleteLoadout } from "./src/services/local-db.ts";
import type { Loadout } from "./src/services/local-db.ts";

const loadout: Loadout = {
  name: "Raid Build",
  classType: 2,  // 0=Titan, 1=Hunter, 2=Warlock
  items: [
    { hash: 111, instanceId: "inst-1", bucketHash: 1498876634, isEquipped: true },
    { hash: 222, instanceId: "inst-2", bucketHash: 2465295065, isEquipped: true },
  ],
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};

saveLoadout(loadout);          // INSERT OR REPLACE — preserves original createdAt
getLoadout("Raid Build");      // → Loadout | null
listLoadouts();                // → Loadout[]
deleteLoadout("Raid Build");
```

#### Saved Searches

```ts
import { saveSearch, listSearches, deleteSearch } from "./src/services/local-db.ts";

saveSearch("nightfall-loadout", "is:weapon tier:exotic slot:kinetic");
listSearches();                // → [{ name, query, createdAt }]
deleteSearch("nightfall-loadout");
```

#### Item keys

Items that have an `instanceId` (weapons, armour) are keyed by it. Stackable items without one (consumables, materials) are keyed by `hash:<hash>`:

```ts
import { itemKey } from "./src/services/local-db.ts";

itemKey({ instanceId: "abc", hash: 123 });  // → "abc"
itemKey({ instanceId: undefined, hash: 123 }); // → "hash:123"
```

---

### `move-planner.ts` — Move Planner

Validates an item transfer and returns a typed step plan before any API calls are made. Handles the two-hop vault relay required for character-to-character transfers transparently.

#### Plan only (no API calls)

```ts
import { planMove } from "./src/services/move-planner.ts";

const plan = planMove(item, { type: "vault" }, idx);
// or:
const plan = planMove(item, { type: "character", characterId: "2305843009299355435" }, idx);

if (!plan.isValid) {
  console.error(plan.errors[0]);
  // e.g. "Ace of Spades is equipped. Unequip it first."
  // e.g. "Item is already in the vault"
  // e.g. "Ace of Spades is locked. Unlock it in-game first."
}

// Inspect the planned steps before executing
for (const step of plan.steps) {
  console.log(step.type);        // "to_vault" | "from_vault" | "equip"
  console.log(step.description); // human-readable summary
}
```

#### Execute a plan

```ts
import { executePlan } from "./src/services/move-planner.ts";

await executePlan(plan, {
  onStep: (step, index, total) => {
    console.log(`[${index + 1}/${total}] ${step.description}`);
  },
});
```

#### Plan + execute in one call

```ts
import { moveItem } from "./src/services/move-planner.ts";

// dryRun: true → validates and returns the plan, never calls the API
const plan = await moveItem(item, { type: "vault" }, idx, { dryRun: true });

// Transfer a partial stack of 20
const plan = await moveItem(item, { type: "vault" }, idx, { count: 20 });

// Character → character (vault relay handled automatically)
const plan = await moveItem(
  item,
  { type: "character", characterId: destCharacterId },
  idx
);
```

Validation errors (checked in order):
1. `item.nonTransferrable` — item cannot leave your inventory
2. `item.isLocked` — locked in-game
3. `item.isEquipped` — must unequip first
4. Already at the destination (vault or same character)

---

### `search.ts` — Query DSL Parser

Parses a search query string into a predicate function. Pure — no API calls, no I/O.

```ts
import { parseQuery } from "./src/services/search.ts";
import { getAllTags, itemKey } from "./src/services/local-db.ts";

const predicate = parseQuery("is:exotic slot:kinetic -is:vault");
const allTags = getAllTags();

const matches = index.all.filter(item =>
  predicate(item, allTags.get(itemKey(item)) ?? [])
);
```

---

### `wishlist.ts` — Wishlist Parser & Roll Grader

Parses DIM-format wishlists and grades weapon rolls.

```ts
import { parseWishlist, loadWishlist, gradeItem } from "./src/services/wishlist.ts";

// Parse from a string
const wl = parseWishlist(fileText);

// Load from a file path or HTTPS URL
const wl = await loadWishlist("~/wishlists/pvp.txt");
const wl = await loadWishlist("https://example.com/wishlist.txt");

// Grade a weapon
const grade = gradeItem(item.hash, item.perks, wl);
// → "god" | "good" | "trash" | "unknown"
```

Grading rules:
- **god** — all perk hashes of any wishlist entry are present on the item (or the entry has no required perks)
- **good** — at least one perk hash from any entry matches
- **trash** — item is on the wishlist but no perks match
- **unknown** — item hash not in the wishlist at all

---

## Notes

- **Tokens** are stored obfuscated at `~/.config/destiny-cli/tokens.json`
- **Manifest** (item definitions) is cached at `~/.cache/destiny-cli/` and auto-updates when Bungie releases a new version
- **Local database** (tags, notes, loadouts, saved searches, roll source cache) is stored at `~/.config/destiny-cli/local.db`
- **Rate limiting** is handled automatically (25 req/s with Retry-After backoff)
- **Refresh tokens** last 90 days — you won't need to re-login often
