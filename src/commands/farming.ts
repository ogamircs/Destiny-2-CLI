import { Command } from "commander";
import chalk from "chalk";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { ensureManifest } from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import {
  saveLoadout,
  getLoadout,
  deleteLoadout,
  listLoadouts,
} from "../services/local-db.ts";
import type { LoadoutItem } from "../services/local-db.ts";
import { planMove, executePlan } from "../services/move-planner.ts";
import { className, success, error, dim, header } from "../ui/format.ts";
import { confirm } from "../ui/prompts.ts";
import { formatError } from "../utils/errors.ts";
import { withSpinner, createSpinner } from "../ui/spinner.ts";

const FARMING_PREFIX = "__farming__:";

function farmingLoadoutName(classType: number): string {
  return `${FARMING_PREFIX}${classType}`;
}

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

// ---------------------------------------------------------------------------
// registerFarmingCommand
// ---------------------------------------------------------------------------

export function registerFarmingCommand(program: Command) {
  const farming = program
    .command("farming")
    .description("Farming mode: clear character inventory to vault and restore");

  // ---- start ----
  farming
    .command("start")
    .description("Move all unequipped, unlocked items to the vault")
    .requiredOption("-c, --character <class>", "Character class (titan/hunter/warlock)")
    .action(async (opts) => {
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

        const loadoutName = farmingLoadoutName(char.classType);
        const existing = getLoadout(loadoutName);
        if (existing) {
          const proceed = await confirm(
            `A farming session for ${className(char.classType)} already exists. Overwrite it?`
          );
          if (!proceed) return;
        }

        // Collect moveable items on character
        const charItems = index.byCharacter.get(char.characterId) ?? [];
        const moveable = charItems.filter(
          (i) => !i.isEquipped && !i.isLocked && !i.nonTransferrable
        );

        if (moveable.length === 0) {
          console.log("No moveable items found on character.");
          return;
        }

        // Save farming loadout BEFORE moving (so stop can recover from partial failure)
        const loadoutItems: LoadoutItem[] = moveable.map((i) => ({
          hash: i.hash,
          instanceId: i.instanceId,
          bucketHash: i.bucketHash,
          isEquipped: false,
        }));

        saveLoadout({
          name: loadoutName,
          classType: char.classType,
          items: loadoutItems,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
        });

        // Move items to vault
        let moved = 0;
        let skipped = 0;

        const spinner = createSpinner(
          `Moving items to vault (0/${moveable.length})...`
        ).start();

        for (const item of moveable) {
          try {
            const plan = planMove(item, { type: "vault" }, index);
            if (!plan.isValid) {
              skipped++;
              continue;
            }
            await executePlan(plan);
            moved++;
            spinner.text = `Moving items to vault (${moved}/${moveable.length})...`;
          } catch {
            skipped++;
          }
        }

        spinner.succeed(
          success(
            `Farming started: ${moved} item(s) moved to vault, ${skipped} skipped`
          )
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- stop ----
  farming
    .command("stop")
    .description("Restore items from vault back to character")
    .requiredOption("-c, --character <class>", "Character class (titan/hunter/warlock)")
    .action(async (opts) => {
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

        const loadoutName = farmingLoadoutName(char.classType);
        const loadout = getLoadout(loadoutName);
        if (!loadout) {
          console.log(
            error(
              `No farming session found for ${className(char.classType)}. Run: destiny farming start --character ${opts.character}`
            )
          );
          process.exit(1);
        }

        let restored = 0;
        let skipped = 0;

        const spinner = createSpinner(
          `Restoring items (0/${loadout.items.length})...`
        ).start();

        for (const loadoutItem of loadout.items) {
          try {
            // Find the item in vault: by instanceId first, then by hash
            let vaultItem = loadoutItem.instanceId
              ? index.byInstanceId.get(loadoutItem.instanceId)
              : undefined;

            if (!vaultItem || vaultItem.location !== "vault") {
              // Fallback: find by hash in vault
              const byHash = index.byHash.get(loadoutItem.hash) ?? [];
              vaultItem = byHash.find((i) => i.location === "vault");
            }

            if (!vaultItem) {
              skipped++;
              continue;
            }

            const plan = planMove(
              vaultItem,
              { type: "character", characterId: char.characterId },
              index
            );

            if (!plan.isValid) {
              skipped++;
              continue;
            }

            await executePlan(plan);
            restored++;
            spinner.text = `Restoring items (${restored}/${loadout.items.length})...`;
          } catch {
            skipped++;
          }
        }

        // Delete loadout even if some items skipped
        deleteLoadout(loadoutName);

        spinner.succeed(
          success(
            `Farming stopped: ${restored} item(s) restored, ${skipped} skipped`
          )
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  // ---- status ----
  farming
    .command("status")
    .description("List active farming sessions (no API call)")
    .action(() => {
      try {
        const all = listLoadouts();
        const sessions = all.filter((l) => l.name.startsWith(FARMING_PREFIX));

        if (sessions.length === 0) {
          console.log("No active farming sessions.");
          return;
        }

        console.log(header("\nActive Farming Sessions"));
        for (const session of sessions) {
          const classLabel = className(session.classType);
          const startedAt = new Date(session.createdAt * 1000).toLocaleString();
          console.log(
            `  ${chalk.bold(classLabel)} — ${session.items.length} item(s) — started ${startedAt}`
          );
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
