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
  User:          amircs
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

If the search matches multiple items (e.g. two scouts both named "something"), an interactive picker appears so you can choose the right one.

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

**Fuzzy search** — Item names are matched by substring, case-insensitive. `"ace"` will find `"Ace of Spades"`.

**Ambiguous matches** — If multiple items match your search, an interactive picker lets you choose.

**Token refresh** — Access tokens expire after 1 hour but refresh automatically. Refresh tokens last 90 days — you won't need to re-login often.

**Debug mode** — Add `--verbose` to any command to see raw API calls, token refresh events, and manifest lookups.

**Standalone binary** — Build a single executable with `bun run scripts/build.ts`, then move `./destiny` to `/usr/local/bin/` for system-wide access.
