# Repository Guidelines

## Project Structure & Module Organization
Core code lives in `src/`.
- `src/index.ts`: entry point (`.env` loading + CLI execution)
- `src/cli.ts`: command registration and global flags
- `src/commands/`: one file per CLI command (`auth`, `inventory`, `transfer`, etc.)
- `src/api/`: Bungie API client wrappers
- `src/services/`: auth, token storage, manifest cache, config
- `src/ui/` and `src/utils/`: terminal formatting, prompts, logging, shared helpers

Build tooling lives in `scripts/` (`scripts/build.ts`). Environment template is `.env.example`.

## Build, Test, and Development Commands
- `bun install`: install dependencies.
- `bun run dev`: run CLI in watch mode during development.
- `bun run start -- <command>`: run the CLI entry directly (example: `bun run start -- characters`).
- `bun run build`: compile a standalone `./destiny` binary for macOS.
- `./destiny <command>`: run the compiled binary (example: `./destiny stats --mode pvp`).

## Coding Style & Naming Conventions
Use TypeScript with ESM and strict compiler settings (`tsconfig.json`).
- Indentation: 2 spaces.
- Prefer double quotes and semicolons (match existing files).
- Keep imports explicit, including `.ts` extensions.
- File names: kebab-case (for example, `auth-service.ts`, `manifest-cache.ts`).
- Functions/variables: `camelCase`; exported factories should be verb-based (`createProgram`, `registerStatsCommand`).

## Testing Guidelines
There is no committed automated test suite yet. Validate changes with targeted CLI runs against a configured `.env`.
- Minimum manual checks: `auth status`, `characters`, and one flow you changed.
- If you add tests, use Bun’s test runner with `*.test.ts` naming and run `bun test`.

## Commit & Pull Request Guidelines
Follow the existing commit style: short, imperative subjects (for example, `Fix OAuth HTTPS callback`, `Add command reference documentation`).
- Keep commits focused to one concern.
- PRs should include: purpose, key changes, manual test commands run, and representative CLI output for behavior changes.

## Security & Configuration Tips
- Never commit `.env` or secrets.
- Use `.env.example` as the source of required keys.
- OAuth/token data is user-local; do not hardcode account-specific paths or credentials.
