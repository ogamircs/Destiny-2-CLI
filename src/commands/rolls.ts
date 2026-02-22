import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { ensureManifest, lookupPerk } from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import { loadWishlist, gradeItem } from "../services/wishlist.ts";
import type { WishlistGrade } from "../services/wishlist.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { className, error, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { withSpinner } from "../ui/spinner.ts";

// ---------------------------------------------------------------------------
// Grade formatting
// ---------------------------------------------------------------------------

function gradeLabel(grade: WishlistGrade): string {
  switch (grade) {
    case "god":
      return chalk.yellow.bold("GOD");
    case "good":
      return chalk.green("GOOD");
    case "trash":
      return chalk.red("TRASH");
    case "unknown":
      return chalk.dim("?");
  }
}

const GRADE_ORDER: Record<WishlistGrade, number> = {
  god: 0,
  good: 1,
  trash: 2,
  unknown: 3,
};

// ---------------------------------------------------------------------------
// registerRollsCommand
// ---------------------------------------------------------------------------

export function registerRollsCommand(program: Command) {
  const rolls = program
    .command("rolls")
    .description("Appraise weapon rolls against a wishlist");

  rolls
    .command("appraise")
    .description("Grade all weapons against a wishlist")
    .requiredOption("--source <file|url>", "Wishlist file path or HTTPS URL")
    .option("--character <class>", "Filter to a specific character (titan/hunter/warlock)")
    .option("--json", "Output results as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => ensureManifest());

        const components = [
          ...getRequiredComponents(),
          DestinyComponentType.ItemPerks,
        ];

        const [profile, wishlist] = await Promise.all([
          withSpinner("Fetching inventory...", () => getProfile(components)),
          withSpinner("Loading wishlist...", () => loadWishlist(opts.source)),
        ]);

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];

        const index = buildInventoryIndex(profile, characters);

        // Filter to weapons (itemType === 3), optionally by character
        let weapons = index.all.filter((i) => i.itemType === 3);

        if (opts.character) {
          const targetClass = opts.character.toLowerCase();
          const char = characters.find(
            (c) => className(c.classType).toLowerCase() === targetClass
          );
          if (!char) {
            console.log(error(`Character "${opts.character}" not found`));
            process.exit(1);
          }
          const charItems = index.byCharacter.get(char.characterId) ?? [];
          const charItemSet = new Set(
            charItems.map((i) => i.instanceId ?? String(i.hash))
          );
          weapons = weapons.filter(
            (i) => charItemSet.has(i.instanceId ?? String(i.hash))
          );
        }

        // Grade each weapon
        const graded = weapons.map((item) => {
          const grade = gradeItem(item.hash, item.perks, wishlist);

          // Resolve perk names for matched perks
          const matchedPerks: string[] = [];
          if (item.perks) {
            for (const ph of item.perks) {
              const perk = lookupPerk(ph);
              if (perk && perk.name && perk.name !== "Unknown Perk") {
                matchedPerks.push(perk.name);
              }
            }
          }

          // Find notes from wishlist entries
          const entries = wishlist.byItemHash.get(item.hash) ?? [];
          const notes = entries
            .map((e) => e.notes)
            .filter(Boolean)
            .join("; ");

          return { item, grade, matchedPerks, notes };
        });

        // Sort: god → good → trash → unknown
        graded.sort(
          (a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]
        );

        if (opts.json) {
          const out = graded.map(({ item, grade, matchedPerks, notes }) => ({
            name: item.name,
            tier: item.tier,
            slot: item.slot,
            power: item.power,
            grade,
            matchedPerks,
            notes,
          }));
          console.log(JSON.stringify(out, null, 2));
          return;
        }

        // Table output
        const table = new Table({
          head: [
            chalk.bold("Grade"),
            chalk.bold("Name"),
            chalk.bold("Tier"),
            chalk.bold("Slot"),
            chalk.bold("Power"),
            chalk.bold("Matched Perks"),
            chalk.bold("Notes"),
          ],
          style: { head: [], border: ["dim"] },
          colWidths: [8, 34, 12, 10, 7, 32, 28],
        });

        for (const { item, grade, matchedPerks, notes } of graded) {
          table.push([
            gradeLabel(grade),
            item.name,
            item.tier,
            item.slot,
            item.power !== undefined ? String(item.power) : "—",
            matchedPerks.slice(0, 3).join(", "),
            notes.slice(0, 50),
          ]);
        }

        const counts = {
          god: graded.filter((g) => g.grade === "god").length,
          good: graded.filter((g) => g.grade === "good").length,
          trash: graded.filter((g) => g.grade === "trash").length,
          unknown: graded.filter((g) => g.grade === "unknown").length,
        };

        console.log(header(`\nRoll Appraisal — ${wishlist.title}`));
        console.log(table.toString());
        console.log(
          `\nSummary: ${chalk.yellow.bold(counts.god)} god  ${chalk.green(counts.good)} good  ${chalk.red(counts.trash)} trash  ${chalk.dim(counts.unknown)} unknown`
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
