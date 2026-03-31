# TODO: DIM Parity Roadmap

Last updated: 2026-03-08

## P0 Foundation ✓ Complete

- [x] Build normalized inventory index service in `src/services/item-index.ts`.
  - Unify profile + manifest + instance data.
  - Include reusable fields: class, bucket, perks, power, lock state.
- [x] Add persistent local metadata DB in `src/services/local-db.ts` (SQLite).
  - Store tags, notes, loadouts, saved searches.
  - Add schema migrations and backup/restore support.
- [x] Add robust transfer planner in `src/services/move-planner.ts`.
  - Support dry-run plans and executable transfer steps.
  - Two-hop vault relay for character-to-character transfers.

## P1 Core Parity Features ✓ Complete

- [x] Implement advanced search DSL command: `destiny search "<query>"`.
  - Support `and/or/not`, `is:`, `tag:`, `power:`, `slot:`, `tier:`, `class:`, bare text.
  - `--save <name>` / `--saved` for persistent queries.
- [x] Implement tags and notes.
  - Commands: `destiny tag add/remove/list`, `destiny note set/clear/show`.
- [x] Implement Farming Mode.
  - Command: `destiny farming start|stop|status --character <class>`.
  - One-shot clear to vault; recovery loadout saved before moves begin.
- [x] Implement god roll appraiser v1 (wishlist-compatible).
  - Command: `destiny rolls appraise --source <name|url|file> [--json]`.
  - Parse DIM wishlist format (`dimwishlist:item=...&perks=...`).
  - Grade rolls as `god / good / trash / unknown`.

## P2 Buildcraft + Management (4-8 weeks)

- [x] Implement loadouts v1.
  - Commands: `destiny loadout create|list|apply|delete|export|import`.
  - Start with item/equip state; add mods/subclass in v2.
- [x] Implement Organizer/Compare/CSV workflows.
  - Commands: `destiny organize --query ...`, `destiny compare "<item>" ...`.
  - Add CSV export for cleanup workflows.
- [x] Implement progression surfaces.
  - Commands: `destiny progress`, `destiny vendors`, `destiny records`.
- [x] Implement god roll finder query mode.
  - Command: `destiny rolls find --perk "<perk>" --perk "<perk>" [--archetype ...]`.
  - Search manifest pools for weapons that can roll requested perk combinations.
- [x] Implement roll source management.
  - Commands: `destiny rolls source set <voltron|choosy|url|file>`, `destiny rolls source show`, `destiny rolls source refresh`.
  - Cache sources locally with update timestamps and fallback behavior.

## P3 Advanced / Parity-Heavy (8-16+ weeks)

- [x] Implement armory-style item deep view.
- [x] Implement loadout optimizer + loadout analysis.
- [x] Evaluate optional cloud sync and offline queued sync.
- [x] Evaluate optional popularity-based scoring overlay.
  - Add external popularity weighting (e.g., light.gg-like signals) on top of deterministic wishlist grading.

## Deferred (Not Planned Now)

- [x] Desktop/mobile packaging features.
- [x] Stream Deck integrations.

## Simplification Pass (2026-03-08)

Goal: reduce command-layer duplication without changing CLI behavior.

- [x] Add shared CLI command/runtime helpers.
  - Centralize `try/catch` + formatted error exit behavior.
- [x] Add shared inventory-loading helpers.
  - Reuse manifest/profile/index loading across commands.
- [x] Centralize character, item, and location resolution.
  - Reuse class lookup, item selection, and location labels.
- [x] Adopt helpers in smaller commands first.
  - Completed for `tag`, `organize`, `compare`, `optimizer`, `inventory`, `transfer`, and `equip`.
- [x] Review the touched simplification area with the local `simplify` skill.
  - Restored `optimizer`'s concurrent inventory + wishlist loading.
  - Simplified `src/commands/optimizer.test.ts` to target the new shared seam directly.
- [ ] Extend helper adoption to remaining command-heavy files.
  - Next candidates: `loadout` and `rolls`.
- [ ] Split `src/services/local-db.ts` behind a compatibility shim.
  - Deferred for now: command tests still mock `../services/local-db.ts` directly, so this wants a separate pass with tight compatibility coverage.
