# Destiny 2 CLI — Command Reference

## Global Flags

These flags work with any command.

| Flag | Description |
|------|-------------|
| `--verbose` | Print debug output (API calls, token refresh, etc.) |
| `--version` | Print CLI version |
| `--help` | Print help for any command |

```bash
destiny --help
destiny <command> --help
destiny --verbose inventory --vault
```

---

## `destiny auth`

Manages Bungie OAuth login. Tokens are stored at `~/.config/destiny-cli/tokens.json`.

### `destiny auth login`

Opens your browser to Bungie's OAuth page. After you authorize, the CLI captures the callback, exchanges the code for tokens, and saves them locally. You only need to do this once — tokens auto-refresh for up to 90 days.

```bash
destiny auth login
```

> If your browser shows a security warning on `localhost`, click **Advanced → Proceed to localhost**.

### `destiny auth status`

Shows whether you're logged in and when your tokens expire.

```bash
destiny auth status
```

```
Auth Status
  User:          Guardian
  Bungie ID:     12345678
  Destiny ID:    4611686018467419916
  Access Token:  valid
  Refresh Token: valid
```

### `destiny auth logout`

Clears all stored credentials.

```bash
destiny auth logout
```

---

## `destiny characters`

Lists all three of your characters with class, race, Guardian Rank, last played time, and total hours.

```bash
destiny characters
destiny chars        # alias
```

```
Characters
┌─────────┬─────────────┬────────┬─────────────┬─────────────┐
│ Class   │ Race/Gender │ Rank   │ Last Played │ Time Played │
├─────────┼─────────────┼────────┼─────────────┼─────────────┤
│ Warlock │ Awoken Male │ Rank 7 │ 3d ago      │ 2085h       │
│ Hunter  │ Exo Male    │ Rank 7 │ 12/1/2025   │ 119h        │
│ Titan   │ Human Male  │ Rank 7 │ 12/1/2025   │ 177h        │
└─────────┴─────────────┴────────┴─────────────┴─────────────┘
```

---

## `destiny inventory`

Shows items across all your characters and vault, grouped by location and slot. Equipped items are marked with a green dot (●).

```bash
destiny inventory
destiny inv          # alias
```

### Flags

| Flag | Description |
|------|-------------|
| `-c, --character <class>` | Show only one character: `titan`, `hunter`, or `warlock` |
| `-v, --vault` | Show vault items only |
| `-s, --slot <slot>` | Filter by gear slot (see slot names below) |
| `-q, --search <query>` | Search items by name (case-insensitive substring) |
| `--json` | Output raw JSON instead of a table |

### Examples

```bash
# All items across all characters and vault
destiny inventory

# Just your Warlock's gear
destiny inventory --character warlock

# Everything in the vault
destiny inventory --vault

# Kinetic weapons only
destiny inventory --slot kinetic

# Search across all locations
destiny inventory --search "ace of spades"

# Combine filters
destiny inventory --character hunter --slot energy

# Pipe to jq
destiny inventory --json | jq '.[] | select(.tier == "Exotic")'
```

### Available Slot Names

`kinetic` · `energy` · `power` · `helmet` · `gauntlets` · `chest` · `legs` · `class item` · `ghost` · `vehicle` · `ship` · `subclass`

---

## `destiny transfer`

Moves an item between a character and the vault, or between two characters. Character-to-character transfers automatically go through the vault (two API calls).

```bash
destiny transfer "<item name>"
destiny move "<item name>"      # alias
```

### Flags

| Flag | Description |
|------|-------------|
| `--to <destination>` | Where to send the item: `vault`, `titan`, `hunter`, or `warlock` |
| `--count <n>` | Number of items to transfer (for stackable items, default: 1) |

### Examples

```bash
# Send to vault (interactive picker if multiple matches)
destiny transfer "Ace of Spades" --to vault

# Pull from vault to your Hunter
destiny transfer "Ace of Spades" --to hunter

# Move between characters (two-hop via vault, handled automatically)
destiny transfer "Outbreak Perfected" --to titan

# Transfer a stack of consumables
destiny transfer "Enhancement Core" --to vault --count 50
```

If the search matches multiple items, an interactive picker appears.

---

## `destiny equip`

Equips an item on a character. If the item is in the vault or on a different character, it's automatically transferred first.

```bash
destiny equip "<item name>"
```

### Flags

| Flag | Description |
|------|-------------|
| `-c, --character <class>` | Which character to equip on: `titan`, `hunter`, or `warlock` |

### Examples

```bash
# Equip on whatever character has it (or prompt if ambiguous)
destiny equip "MIDA Multi-Tool"

# Equip on a specific character (transfers from vault if needed)
destiny equip "Ace of Spades" --character hunter
```

---

## `destiny tag`

Attach persistent tags to items. Tags are stored locally (no API required to read/write them) and are used as a filter in `destiny search`.

```bash
destiny tag add <item> <tag>
destiny tag remove <item> <tag>
destiny tag list <item>
```

### Examples

```bash
# Tag a weapon for later reference
destiny tag add "Ace of Spades" god-roll
destiny tag add "Ace of Spades" pvp-main

# View all tags on an item
destiny tag list "Ace of Spades"
#   • god-roll
#   • pvp-main

# Remove a tag
destiny tag remove "Ace of Spades" pvp-main

# Use tags in search
destiny search "tag:god-roll"
destiny search "is:weapon tag:god-roll tier:exotic"
```

Tag names are arbitrary strings — use any convention you like (`god-roll`, `infuse`, `shard`, `keep`, etc.).

---

## `destiny note`

Attach a free-text note to any item.

```bash
destiny note set <item> <text>
destiny note show <item>
destiny note clear <item>
```

### Examples

```bash
destiny note set "Ace of Spades" "save for trials night"
destiny note show "Ace of Spades"
# Ace of Spades: save for trials night

destiny note clear "Ace of Spades"
destiny note show "Ace of Spades"
# Ace of Spades: (no note set)
```

---

## `destiny search`

Search your entire inventory — all characters and vault — using a structured query language. More powerful than `inventory --search`, which only does name substring matching.

```bash
destiny search "<query>"
destiny search "<query>" --json
destiny search "<query>" --save <name>
destiny search --saved
```

### Flags

| Flag | Description |
|------|-------------|
| `--json` | Output matched items as JSON |
| `--save <name>` | Save this query with a name for later reuse |
| `--saved` | List all previously saved queries |

### Query Syntax

Space = AND (implicit). `or` keyword = lower-precedence OR. `-` or `not:` prefix = negate.

| Qualifier | Examples | Matches |
|---|---|---|
| `is:weapon` / `is:armor` / `is:ghost` / `is:consumable` / `is:mod` / `is:emblem` / `is:ship` / `is:vehicle` / `is:subclass` | `is:weapon` | item type |
| `is:exotic` / `is:legendary` / `is:rare` / `is:uncommon` / `is:common` | `is:legendary` | tier |
| `is:equipped` / `is:locked` / `is:vault` | `is:equipped` | state |
| `is:solar` / `is:arc` / `is:void` / `is:strand` / `is:stasis` / `is:kinetic` | `is:solar` | damage type |
| `is:titan` / `is:hunter` / `is:warlock` | `is:titan` | class restriction |
| `tag:<value>` | `tag:god-roll` | item has that tag |
| `slot:<name>` | `slot:kinetic` | gear slot (case-insensitive) |
| `tier:<name>` | `tier:exotic` | tier (case-insensitive) |
| `power:<expr>` | `power:>1800`, `power:<=1750`, `power:1810` | numeric power comparison (`>`, `<`, `>=`, `<=`, or exact) |
| `class:<name>` | `class:titan`, `class:any` | class restriction |
| bare text | `ace` | item name substring (case-insensitive) |

Unknown qualifiers always return false (they don't silently match everything).

### Examples

```bash
# Exotic weapons
destiny search "is:exotic is:weapon"

# All gear above 1800 power
destiny search "power:>1800"

# Tagged items in the vault
destiny search "tag:god-roll is:vault"

# Exotics or legendaries
destiny search "is:exotic or is:legendary"

# Non-exotic kinetic weapons
destiny search "is:weapon slot:kinetic -is:exotic"

# Titan-only armor pieces
destiny search "is:armor is:titan"

# Save and recall a common query
destiny search "is:weapon tag:pvp-main" --save pvp-main
destiny search --saved
```

---

## `destiny rolls`

Appraise your weapons against a DIM-format wishlist to see which ones are worth keeping.

### `destiny rolls appraise`

```bash
destiny rolls appraise --source <file|url>
destiny rolls appraise --source <file|url> --character <class>
destiny rolls appraise --source <file|url> --json
```

### Flags

| Flag | Description |
|------|-------------|
| `--source <path|url>` | Wishlist file path or `https://` URL **(required)** |
| `-c, --character <class>` | Limit to weapons on one character: `titan`, `hunter`, or `warlock` |
| `--json` | Output results as JSON |

### Examples

```bash
# Appraise all weapons against a local wishlist
destiny rolls appraise --source ~/wishlists/pvp.txt

# Pull a community wishlist from GitHub
destiny rolls appraise --source https://raw.githubusercontent.com/48klocs/dim-wish-list-sources/master/voltron.txt

# Only your Hunter's weapons
destiny rolls appraise --source ~/wishlist.txt --character hunter

# JSON for scripting
destiny rolls appraise --source ~/wishlist.txt --json | jq '.[] | select(.grade == "god")'
```

### Output

Results are sorted **GOD → GOOD → TRASH → ?** and displayed in a table:

```
Roll Appraisal — My PvP Wishlist
┌───────┬────────────────────┬───────────┬─────────┬───────┬───────────────────┬───────────────┐
│ Grade │ Name               │ Tier      │ Slot    │ Power │ Matched Perks     │ Notes         │
├───────┼────────────────────┼───────────┼─────────┼───────┼───────────────────┼───────────────┤
│ GOD   │ Ace of Spades      │ Exotic    │ Kinetic │ 1812  │                   │               │
│ GOOD  │ Fatebringer        │ Legendary │ Energy  │ 1808  │ Explosive Payload │ solid pve     │
│ TRASH │ Hand Cannon        │ Legendary │ Kinetic │ 1795  │                   │               │
│ ?     │ Scout Rifle        │ Legendary │ Kinetic │ 1800  │                   │               │
└───────┴────────────────────┴───────────┴─────────┴───────┴───────────────────┴───────────────┘

Summary: 1 god  1 good  1 trash  1 unknown
```

### Wishlist Format

Wishlists must use the DIM format:

```
title:My PvP Wishlist
// This is a comment
dimwishlist:item=1853794338&perks=2523465992,4004944400&notes:god roll for pvp
dimwishlist:item=1853794338&perks=&notes:any roll is good
```

- `item=` — Bungie item hash
- `perks=` — comma-separated perk hashes (empty = any roll is good)
- `&notes:` — optional free-text note (displayed in table)
- Lines starting with `//` are ignored
- `item=-1` wildcard entries are skipped

Grading:
- **GOD** — every perk hash of any matching entry is on the item, or the entry has no required perks
- **GOOD** — at least one perk hash from any entry matches
- **TRASH** — item is on the wishlist but zero perks match
- **?** (unknown) — item hash not found in the wishlist

---

## `destiny farming`

Farming mode clears a character's unequipped, unlocked items to the vault in one shot. A recovery loadout is saved first so `stop` can always restore your gear — even if the session was interrupted.

### `destiny farming start`

```bash
destiny farming start --character <class>
destiny farming start -c <class>
```

Moves all unequipped, unlocked, transferrable items from the character to the vault. Skips locked items, equipped gear, and non-transferrable items silently.

If a farming session for that character already exists, you'll be asked to confirm before overwriting.

```bash
destiny farming start --character warlock
# → Farming started: 23 items moved to vault, 0 skipped
```

### `destiny farming stop`

```bash
destiny farming stop --character <class>
destiny farming stop -c <class>
```

Restores items from the vault back to the character using the saved recovery loadout. Items are matched by instance ID first, then by hash as a fallback.

```bash
destiny farming stop --character warlock
# → Farming stopped: 22 items restored, 1 skipped
```

After `stop`, the session loadout is deleted regardless of how many items were skipped.

### `destiny farming status`

```bash
destiny farming status
```

Lists active farming sessions without making any API calls.

```
Active Farming Sessions
  Warlock — 23 items — started 2/21/2026, 8:14:00 PM
```

---

## `destiny stats`

Shows lifetime stats for your account and each character, broken down by activity mode.

```bash
destiny stats
```

### Flags

| Flag | Description |
|------|-------------|
| `-m, --mode <mode>` | Activity mode (default: `all`) |
| `-c, --character <class>` | Show only one character: `titan`, `hunter`, or `warlock` |
| `--json` | Output raw JSON |

### Available Modes

| Mode | Description |
|------|-------------|
| `pvp` | All PvP (Crucible) |
| `pve` | All PvE |
| `raid` | Raids |
| `strikes` | Strikes |
| `nightfall` | Nightfall Strikes |
| `dungeon` | Dungeons |
| `gambit` | Gambit |
| `trials` | Trials of Osiris |
| `ironbanner` | Iron Banner |

### Examples

```bash
# Overall account stats (all modes)
destiny stats

# PvP stats only
destiny stats --mode pvp

# Raid stats for your Warlock only
destiny stats --mode raid --character warlock

# Raw JSON (useful for scripting)
destiny stats --mode pvp --json
```

---

## Tips

**Fuzzy search** — Item names in `transfer`, `equip`, `tag`, `note`, and `rolls` are matched by substring, case-insensitive. `"ace"` finds `"Ace of Spades"`.

**Ambiguous matches** — If multiple items match, an interactive picker lets you choose the right one.

**Search vs inventory** — `destiny search` uses the full query DSL (tags, power ranges, damage types, etc.). `destiny inventory --search` is a simpler name-only substring filter.

**Token refresh** — Access tokens expire after 1 hour but refresh automatically. Refresh tokens last 90 days.

**Debug mode** — Add `--verbose` to any command to see raw API calls, token refresh events, and manifest lookups.

**Standalone binary** — Build with `bun run scripts/build.ts`, then move `./destiny` to `/usr/local/bin/` for system-wide access.
