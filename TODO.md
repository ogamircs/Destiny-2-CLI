# TODO: DIM Parity Roadmap

Last updated: 2026-02-21

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

- [ ] Implement loadouts v1.
  - Commands: `destiny loadout create|list|apply|delete|export|import`.
  - Start with item/equip state; add mods/subclass in v2.
- [ ] Implement Organizer/Compare/CSV workflows.
  - Commands: `destiny organize --query ...`, `destiny compare "<item>" ...`.
  - Add CSV export for cleanup workflows.
- [ ] Implement progression surfaces.
  - Commands: `destiny progress`, `destiny vendors`, `destiny records`.
- [ ] Implement god roll finder query mode.
  - Command: `destiny rolls find --perk "<perk>" --perk "<perk>" [--archetype ...]`.
  - Search manifest pools for weapons that can roll requested perk combinations.
- [ ] Implement roll source management.
  - Commands: `destiny rolls source set <voltron|choosy|url|file>`, `destiny rolls source show`, `destiny rolls source refresh`.
  - Cache sources locally with update timestamps and fallback behavior.

## P3 Advanced / Parity-Heavy (8-16+ weeks)

- [ ] Implement armory-style item deep view.
- [ ] Implement loadout optimizer + loadout analysis.
- [ ] Evaluate optional cloud sync and offline queued sync.
- [ ] Evaluate optional popularity-based scoring overlay.
  - Add external popularity weighting (e.g., light.gg-like signals) on top of deterministic wishlist grading.

## Deferred (Not Planned Now)

- [ ] Desktop/mobile packaging features.
- [ ] Stream Deck integrations.
- [ ] Web-only visual workflows.
