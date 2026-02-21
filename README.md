# Destiny 2 CLI

A macOS command-line tool for Destiny 2. View your characters, browse inventory, transfer items, and check stats — all from the terminal.

## Requirements

- [Bun](https://bun.sh) v1.1+
- macOS (arm64 or x64)
- A Bungie API application (free — takes ~2 minutes to set up)

## Bungie API Setup

1. Go to [bungie.net/en/Application](https://www.bungie.net/en/Application) and click **Create New App**
2. Fill in the details:
   - **OAuth Client Type**: Confidential
   - **Redirect URL**: `http://localhost:3847/callback`
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
# List all your characters with class, light level, and last played time
destiny characters
```

```
Characters
┌─────────┬─────────────────┬───────┬─────────────┬────────────┐
│ Class   │ Race/Gender     │ Light │ Last Played │ Time Played│
├─────────┼─────────────────┼───────┼─────────────┼────────────┤
│ Hunter  │ Awoken Female   │ 1995  │ 2h ago      │ 1842h      │
│ Titan   │ Human Male      │ 1988  │ 3d ago      │ 412h       │
│ Warlock │ Exo Female      │ 1975  │ 5d ago      │ 203h       │
└─────────┴─────────────────┴───────┴─────────────┴────────────┘
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
├── api/                  # Thin fetch wrappers for Bungie API endpoints
├── services/             # Auth flow, token storage, manifest cache
├── ui/                   # Tables, spinners, prompts, color formatters
└── utils/                # Constants, error types, debug logger
```

## Notes

- **Tokens** are stored obfuscated at `~/.config/destiny-cli/tokens.json`
- **Manifest** (item definitions) is cached at `~/.cache/destiny-cli/` and auto-updates when Bungie releases a new version
- **Rate limiting** is handled automatically (25 req/s with Retry-After backoff)
- **Refresh tokens** last 90 days — you won't need to re-login often
