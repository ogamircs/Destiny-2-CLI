import { Command } from "commander";
import { join } from "path";
import chalk from "chalk";
import Table from "cli-table3";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { equipItem } from "../api/inventory.ts";
import { ensureManifest } from "../services/manifest-cache.ts";
import {
  buildInventoryIndex,
  getRequiredComponents,
  type IndexedItem,
} from "../services/item-index.ts";
import {
  saveLoadout,
  getLoadout,
  listLoadouts,
  deleteLoadout,
} from "../services/local-db.ts";
import type { LoadoutItem } from "../services/local-db.ts";
import { planMove, executePlan } from "../services/move-planner.ts";
import { className, success, error, dim, header } from "../ui/format.ts";
import { confirm, pickCharacter } from "../ui/prompts.ts";
import { withSpinner, createSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";

const FARMING_PREFIX = "__farming__:";

function loadoutApplyCandidateScore(
  item: IndexedItem,
  targetCharacterId: string
): number {
  let score = 0;

  if (item.location === targetCharacterId) {
    score += 100;
  } else if (item.location === "vault") {
    score += 50;
  } else {
    score += 30;
  }

  if (item.transferStatus === 0 && !item.nonTransferrable) {
    score += 25;
  }
  if (!item.nonTransferrable) {
    score += 15;
  }
  if (!item.isLocked) {
    score += 10;
  }
  if (!item.isEquipped) {
    score += 5;
  }
  if (item.instanceId) {
    score += 2;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Character resolution helpers
// ---------------------------------------------------------------------------

function resolveCharacter(
  characters: CharacterData[],
  classArg: string
): CharacterData {
  const lower = classArg.toLowerCase();
  const char = characters.find(
    (c) => className(c.classType).toLowerCase() === lower
  );
  if (!char) {
    throw new Error(
      `Character "${classArg}" not found. Available: ${characters
        .map((c) => className(c.classType).toLowerCase())
        .join(", ")}`
    );
  }
  return char;
}

async function resolveCharacterForApply(
  characters: CharacterData[],
  classArg: string | undefined,
  loadoutClassType: number
): Promise<CharacterData> {
  if (classArg) {
    return resolveCharacter(characters, classArg);
  }

  // Auto-resolve from loadout's classType
  const matches = characters.filter((c) => c.classType === loadoutClassType);
  if (matches.length === 0) {
    throw new Error(
      `No ${className(loadoutClassType)} character found. Available: ${characters
        .map((c) => className(c.classType).toLowerCase())
        .join(", ")}`
    );
  }
  if (matches.length === 1) {
    return matches[0]!;
  }
  return pickCharacter(matches, "Multiple matching characters — select one:");
}

// ---------------------------------------------------------------------------
// registerLoadoutCommand
// ---------------------------------------------------------------------------

export function registerLoadoutCommand(program: Command) {
  const loadout = program
    .command("loadout")
    .description("Manage loadouts: create, list, apply, delete, export, import");

  // ---- create ----
  loadout
    .command("create <name>")
    .description("Snapshot currently equipped items and save as a loadout")
    .requiredOption("-c, --character <class>", "Character class (titan/hunter/warlock)")
    .action(async (name: string, opts) => {
      try {
        await withSpinner("Loading manifest...", () => ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile(getRequiredComponents())
        );

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];

        const char = resolveCharacter(characters, opts.character);
        const index = buildInventoryIndex(profile, characters);

        const charItems = index.byCharacter.get(char.characterId) ?? [];
        const equipped = charItems.filter((i) => i.isEquipped);

        const existing = getLoadout(name);
        if (existing) {
          const proceed = await confirm(`Loadout "${name}" already exists. Overwrite?`);
          if (!proceed) return;
        }

        const loadoutItems: LoadoutItem[] = equipped.map((i) => ({
          hash: i.hash,
          instanceId: i.instanceId,
          bucketHash: i.bucketHash,
          isEquipped: true,
        }));

        const now = Math.floor(Date.now() / 1000);
        saveLoadout({
          name,
          classType: char.classType,
          items: loadoutItems,
          createdAt: now,
          updatedAt: now,
        });

        console.log(
          success(
            `Loadout "${name}" saved with ${loadoutItems.length} item(s) (${className(char.classType)})`
          )
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- list ----
  loadout
    .command("list")
    .description("List all saved loadouts")
    .action(() => {
      try {
        const all = listLoadouts().filter(
          (l) => !l.name.startsWith(FARMING_PREFIX)
        );

        if (all.length === 0) {
          console.log(dim("No loadouts saved."));
          return;
        }

        const table = new Table({
          head: [
            chalk.bold("Name"),
            chalk.bold("Class"),
            chalk.bold("Items"),
            chalk.bold("Saved"),
          ],
          style: { head: [], border: ["dim"] },
        });

        for (const l of all) {
          const savedAt = new Date(l.updatedAt * 1000).toLocaleString();
          table.push([l.name, className(l.classType), String(l.items.length), savedAt]);
        }

        console.log(header("\nLoadouts"));
        console.log(table.toString());
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- apply ----
  loadout
    .command("apply <name>")
    .description("Transfer and equip all items from a saved loadout")
    .option("-c, --character <class>", "Target character class (titan/hunter/warlock)")
    .action(async (name: string, opts) => {
      try {
        const saved = getLoadout(name);
        if (!saved) {
          console.error(error(`Loadout "${name}" not found. Run: destiny loadout list`));
          process.exit(1);
        }

        await withSpinner("Loading manifest...", () => ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile(getRequiredComponents())
        );

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];

        const char = await resolveCharacterForApply(
          characters,
          opts.character,
          saved.classType
        );

        const index = buildInventoryIndex(profile, characters);

        let equipped = 0;
        let skipped = 0;
        const total = saved.items.length;

        const spinner = createSpinner(`Applying loadout (0/${total})...`).start();

        for (const loadoutItem of saved.items) {
          try {
            const candidatesToTry: IndexedItem[] = [];
            const seenCandidates = new Set<string>();
            const pushCandidate = (candidate: IndexedItem | undefined) => {
              if (!candidate) return;
              const key = `${candidate.instanceId ?? `hash:${candidate.hash}`}:${candidate.location}`;
              if (seenCandidates.has(key)) return;
              seenCandidates.add(key);
              candidatesToTry.push(candidate);
            };

            // Try exact instance first when present, then hash fallback candidates ranked
            // by likely transfer/equip success.
            if (loadoutItem.instanceId) {
              pushCandidate(index.byInstanceId.get(loadoutItem.instanceId));
            }

            const hashCandidates = [...(index.byHash.get(loadoutItem.hash) ?? [])].sort(
              (a, b) =>
                loadoutApplyCandidateScore(b, char.characterId) -
                loadoutApplyCandidateScore(a, char.characterId)
            );
            for (const candidate of hashCandidates) {
              pushCandidate(candidate);
            }

            if (candidatesToTry.length === 0) {
              skipped++;
              continue;
            }

            let applied = false;

            for (const item of candidatesToTry) {
              try {
                const instanceId = item.instanceId ?? "0";

                if (item.location === char.characterId && item.isEquipped) {
                  // Already equipped on target — nothing to do
                  equipped++;
                  spinner.text = `Applying loadout (${equipped}/${total})...`;
                  applied = true;
                  break;
                }

                if (item.location === char.characterId && !item.isEquipped) {
                  // Already on character, just equip
                  await equipItem(instanceId, char.characterId);
                  equipped++;
                  spinner.text = `Applying loadout (${equipped}/${total})...`;
                  applied = true;
                  break;
                }

                // Need to transfer first
                const plan = planMove(
                  item,
                  { type: "character", characterId: char.characterId },
                  index
                );
                if (!plan.isValid) {
                  continue;
                }

                await executePlan(plan);
                await equipItem(instanceId, char.characterId);
                equipped++;
                spinner.text = `Applying loadout (${equipped}/${total})...`;
                applied = true;
                break;
              } catch {
                continue;
              }
            }

            if (!applied) {
              skipped++;
            }
          } catch {
            skipped++;
          }
        }

        spinner.succeed(
          success(`Loadout applied: ${equipped} item(s) equipped, ${skipped} skipped`)
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- delete ----
  loadout
    .command("delete <name>")
    .description("Delete a saved loadout")
    .action(async (name: string) => {
      try {
        const existing = getLoadout(name);
        if (!existing) {
          console.error(error(`Loadout "${name}" not found. Run: destiny loadout list`));
          process.exit(1);
        }

        const proceed = await confirm(`Delete loadout "${name}"?`);
        if (!proceed) return;

        deleteLoadout(name);
        console.log(success(`Loadout "${name}" deleted.`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- export ----
  loadout
    .command("export <name>")
    .description("Export a loadout to a JSON file")
    .option("-o, --out <file>", "Output file path")
    .action(async (name: string, opts) => {
      try {
        const saved = getLoadout(name);
        if (!saved) {
          console.error(error(`Loadout "${name}" not found. Run: destiny loadout list`));
          process.exit(1);
        }

        const defaultFileName =
          name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() + ".json";
        const outPath: string = opts.out ?? join(process.cwd(), defaultFileName);

        await Bun.write(outPath, JSON.stringify(saved, null, 2));
        console.log(success(`Loadout "${name}" exported to ${outPath}`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- import ----
  loadout
    .command("import <file>")
    .description("Import a loadout from a JSON file")
    .option("-n, --name <name>", "Override the loadout name from the file")
    .action(async (filePath: string, opts) => {
      try {
        const file = Bun.file(filePath);
        if (!(await file.exists())) {
          console.error(error(`File not found: ${filePath}`));
          process.exit(1);
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch {
          console.error(error(`Could not parse JSON from "${filePath}"`));
          process.exit(1);
        }

        if (
          !parsed ||
          typeof parsed !== "object" ||
          !("name" in parsed) ||
          !("classType" in parsed) ||
          !("items" in parsed)
        ) {
          console.error(
            error(`Invalid loadout file: missing required fields (name, classType, items)`)
          );
          process.exit(1);
        }

        const data = parsed as { name: string; classType: number; items: LoadoutItem[] };
        const finalName: string = opts.name ?? data.name;

        const existing = getLoadout(finalName);
        if (existing) {
          const proceed = await confirm(`Loadout "${finalName}" already exists. Overwrite?`);
          if (!proceed) return;
        }

        const now = Math.floor(Date.now() / 1000);
        saveLoadout({
          name: finalName,
          classType: data.classType,
          items: data.items,
          createdAt: now,
          updatedAt: now,
        });

        console.log(
          success(
            `Loadout "${finalName}" imported with ${data.items.length} item(s)`
          )
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
