# Improvement plan

Audit of the Destiny CLI as of this branch. Items marked done shipped in this pull request. The rest are follow-ups for Amir.

## P0 — Bugs and safety

1. **Done: test suite isolation.** `bun test` shared one module registry, so `mock.module()` leaked across files and the full suite failed even though each file passed alone. `bun test` now runs with `--isolate`.
2. **Done: manifest install race.** The zip extract renamed the SQLite file without waiting, and a failed unzip still wrote the version file. The version is recorded only after the `.content` database is in place, and unzip failures are surfaced.
3. **Done: API client concurrency.** The rate limiter let a burst of callers through together, and overlapping 401s could refresh the same token twice. Starts are queued, and one refresh is shared.
4. **Done: credential handling.**
   - OAuth `state` is checked before the code is exchanged.
   - The success page escapes the display name.
   - `tokens.json` and the localhost private key are mode `0600`.
   - `.env` parsing accepts `export`, quotes, and strips unquoted inline comments.
   - The on-disk token format is still XOR plus base64. It is obfuscation, not encryption. Replacing it needs a migration Amir should choose (OS keychain vs. a real local key).
5. **Done: ambiguous characters.** `--character hunter` used to return the first match. Duplicate classes now require a character id. A unique class name still behaves as before. Character ids and unique id prefixes also match.

## P1 — Destiny 1

6. **Done: `--game d1`.** Destiny 2 stays the default. See the README for the command matrix and the endpoints that cannot be supported.
7. **Not verified live.** No Bungie API key was available here. Request shapes follow the Destiny 1 platform docs (`https://www.bungie.net/d1/Platform`) and Destiny Item Manager's client. Amir should log in with an Xbox or PlayStation membership and run `characters`, `inventory`, `transfer` (dry path first), `stats --mode pvp`, `progress`, `records`, and `vendors`.
8. **Open: race labels.** Destiny 1 account payloads expose `raceHash`, not always `raceType`. Known Human, Awoken, and Exo hashes are mapped. An unexpected hash shows as Unknown.
9. **Open: D1 perk appraisal.** Selected perk hashes are kept when the inventory payload includes them, but `rolls` stays disabled because DIM wishlists are Destiny 2 socket data.
10. **Open: vendor sales.** The bulk vendor route is retired. `vendors --game d1` lists advisors. A per-vendor hash lookup could be added later if a manifest vendor list is worth maintaining.

## P2 — Quality follow-ups

11. **Typecheck covers application source only.** `bun run typecheck` excludes `*.test.ts`. Those files still have about 44 pre-existing `tsc` errors, mostly `mock()` call tuples. Runtime tests pass. Cleaning the mocks is a separate pass.
12. **No ESLint config.** The repo relies on `tsc` and `bun test`.
13. **HTTP 429 is still thrown** instead of retried, so interactive commands do not hang on `Retry-After`. A single bounded retry could be added if Amir wants it.
14. **`getConfig()` caches the first successful read** for the process. That is fine for the CLI and is covered by a test. A long-running embedder cannot rotate keys without a new process.
15. **Manifest install still shells out to `unzip`.** The failure is now explicit when `unzip` is missing.
16. **`bun run build` still targets `bun-darwin-arm64` only.** Linux and Windows binaries are not produced.
17. **Search queries cannot contain a slot name with a space** (`slot:class item` splits into two terms). `--slot "class item"` works. Changing the DSL would affect existing queries.
18. **TODO.md still lists helper adoption for `loadout` and `rolls`, and splitting `local-db.ts`.** Those remain worthwhile, but they are larger than this pass and the command tests mock `local-db.ts` directly.

## Suggested order for anything left

1. Live-check Destiny 1 with a console membership and adjust response unwrapping if Bungie wraps a field differently than the fixtures.
2. Decide whether token storage should move to the OS keychain.
3. Fix the pre-existing test-file `tsc` errors, then typecheck tests too.
4. Add a bounded 429 retry only if command latency is acceptable.
