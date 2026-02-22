# Repository Guidelines

## Project Structure & Module Organization

Core code lives in `src/`.
- `src/index.ts`: entry point (`.env` loading + CLI execution)
- `src/cli.ts`: command registration and global flags
- `src/commands/`: one file per CLI command (`auth`, `inventory`, `transfer`, `tag`, `search`, `rolls`, `farming`, etc.)
- `src/api/`: Bungie API client wrappers
- `src/services/`: auth, token storage, manifest cache, inventory index, search DSL, wishlist parser, move planner, local DB
- `src/ui/` and `src/utils/`: terminal formatting, prompts, logging, shared helpers

Build tooling lives in `scripts/` (`scripts/build.ts`). Environment template is `.env.example`.

## Build, Test, and Development Commands

- `bun install`: install dependencies.
- `bun run dev`: run CLI in watch mode during development.
- `bun run start -- <command>`: run the CLI entry directly (example: `bun run start -- characters`).
- `bun run build`: compile a standalone `./destiny` binary for macOS.
- `bun test`: run the full unit test suite.
- `bun test --watch`: run tests in watch mode.
- `bun test src/path/to.test.ts`: run a single test file.
- `./destiny <command>`: run the compiled binary (example: `./destiny stats --mode pvp`).

## Command List

| Command | File | Description |
|---|---|---|
| `auth login/logout/status` | `commands/auth.ts` | Bungie OAuth |
| `characters` | `commands/characters.ts` | List characters |
| `inventory` | `commands/inventory.ts` | Browse inventory |
| `transfer` / `move` | `commands/transfer.ts` | Move items |
| `equip` | `commands/equip.ts` | Equip items |
| `stats` | `commands/stats.ts` | Lifetime stats |
| `tag add/remove/list` | `commands/tag.ts` | Tag items |
| `note set/clear/show` | `commands/tag.ts` | Item notes |
| `search` | `commands/search.ts` | DSL inventory search |
| `rolls appraise` | `commands/rolls.ts` | Wishlist roll grader |
| `farming start/stop/status` | `commands/farming.ts` | Farming mode |

## Key Services

| Service | Purpose |
|---|---|
| `services/item-index.ts` | Normalized inventory index (profile + manifest + instances) |
| `services/local-db.ts` | SQLite for tags, notes, loadouts, saved searches |
| `services/move-planner.ts` | Validates and plans transfers before API calls |
| `services/search.ts` | Pure DSL query parser (`is:`, `tag:`, `power:`, `slot:`, etc.) |
| `services/wishlist.ts` | DIM wishlist parser + god/good/trash/unknown grader |
| `services/manifest-cache.ts` | Manifest download, cache, item/bucket/perk lookups |
| `services/token-store.ts` | Obfuscated token persistence |
| `services/auth-service.ts` | OAuth login flow |
| `services/config.ts` | Path and config resolution |

## Coding Style & Naming Conventions

Use TypeScript with ESM and strict compiler settings (`tsconfig.json`).
- Indentation: 2 spaces.
- Prefer double quotes and semicolons (match existing files).
- Keep imports explicit, including `.ts` extensions.
- File names: kebab-case (for example, `auth-service.ts`, `manifest-cache.ts`).
- Functions/variables: `camelCase`; exported factories should be verb-based (`createProgram`, `registerStatsCommand`).

## Testing Guidelines

Tests live alongside source files as `*.test.ts`. Run them with `bun test`.
- Unit tests for pure functions (search DSL, wishlist parser, move planner) require no mocking.
- Command tests mock `api/profile.ts`, `services/manifest-cache.ts`, `services/local-db.ts`, `services/item-index.ts`, and `ui/spinner.ts` using `mock.module()`.
- Use unique import cache-busters (`?t=${Date.now()}`) when importing mocked command modules.
- Always restore mocks in `afterEach` with `mock.restore()`.

## Commit & Pull Request Guidelines

Follow the existing commit style: short, imperative subjects (for example, `Fix OAuth HTTPS callback`, `Add P1 core parity features`).
- Keep commits focused to one concern.
- PRs should include: purpose, key changes, manual test commands run, and representative CLI output for behavior changes.

## Security & Configuration Tips

- Never commit `.env` or secrets.
- Use `.env.example` as the source of required keys.
- OAuth/token data is user-local; do not hardcode account-specific paths or credentials.
