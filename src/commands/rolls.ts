import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { getProfile, type CharacterData } from "../api/profile.ts";
import {
  ensureManifest,
  findWeaponsByPerkGroups,
  lookupPerk,
  searchPerks,
} from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import { getRollSource } from "../services/local-db.ts";
import {
  loadWishlistForAppraise,
  refreshRollSourceWithFallback,
  setRollSourceAndRefresh,
} from "../services/roll-source.ts";
import { gradeItem } from "../services/wishlist.ts";
import type { WishlistGrade } from "../services/wishlist.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { className, dim, error, header, success } from "../ui/format.ts";
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

interface ResolvedPerkGroup {
  query: string;
  perkHashes: number[];
  perkNames: string[];
}

function collectPerkFlag(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function resolvePerkGroup(query: string): ResolvedPerkGroup {
  const matches = searchPerks(query);
  if (matches.length === 0) {
    throw new Error(`Perk "${query}" not found in manifest`);
  }

  const exactMatches = matches.filter(
    (perk) => perk.name.toLowerCase() === query.toLowerCase()
  );
  const selected = exactMatches.length > 0 ? exactMatches : matches;

  const perkHashes = Array.from(new Set(selected.map((perk) => perk.hash)));
  const perkNames = uniqueStrings(selected.map((perk) => perk.name));

  return {
    query,
    perkHashes,
    perkNames,
  };
}

function matchedPerkNamesForWeapon(
  weaponPerks: number[],
  resolvedGroups: ResolvedPerkGroup[]
): string[] {
  const weaponPerkSet = new Set(weaponPerks);
  const matched: string[] = [];

  for (const group of resolvedGroups) {
    const matchedHash = group.perkHashes.find((hash) => weaponPerkSet.has(hash));
    if (!matchedHash) {
      continue;
    }
    const perk = lookupPerk(matchedHash);
    matched.push(perk?.name || group.perkNames[0] || group.query);
  }

  return uniqueStrings(matched);
}

function formatUnixTimestamp(timestamp: number | null): string {
  if (!timestamp) {
    return "never";
  }
  return new Date(timestamp * 1000).toLocaleString();
}

// ---------------------------------------------------------------------------
// registerRollsCommand
// ---------------------------------------------------------------------------

export function registerRollsCommand(program: Command) {
  const rolls = program
    .command("rolls")
    .description("Appraise and discover weapon rolls");

  const source = rolls
    .command("source")
    .description("Manage the default wishlist source for roll appraisal");

  source
    .command("set <source>")
    .description("Set and cache a source (voltron|choosy|url|file)")
    .action(async (sourceInput: string) => {
      try {
        const { state, wishlist } = await withSpinner(
          "Setting roll source...",
          () => setRollSourceAndRefresh(sourceInput)
        );

        console.log(success(`Roll source set to "${state.sourceInput}"`));
        console.log(`Resolved: ${state.sourceResolved}`);
        console.log(
          dim(
            `Cached ${wishlist.entries.length} entries at ${formatUnixTimestamp(state.cacheUpdatedAt)}.`
          )
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  source
    .command("show")
    .description("Show the current source and cache status")
    .action(() => {
      try {
        const state = getRollSource();

        if (!state) {
          console.log(
            dim(
              "No roll source configured. Run: destiny rolls source set <voltron|choosy|url|file>"
            )
          );
          return;
        }

        console.log(header("\nRoll Source"));
        console.log(`Source: ${state.sourceInput}`);
        console.log(`Resolved: ${state.sourceResolved}`);
        console.log(`Type: ${state.sourceKind}`);
        console.log(`Configured: ${formatUnixTimestamp(state.sourceUpdatedAt)}`);
        if (state.cacheUpdatedAt && state.cacheText) {
          console.log(
            `Cache: ${formatUnixTimestamp(state.cacheUpdatedAt)} (${state.cacheText.length} bytes)`
          );
        } else {
          console.log("Cache: empty");
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  source
    .command("refresh")
    .description("Refresh the cached wishlist from the configured source")
    .action(async () => {
      try {
        const refreshed = await withSpinner("Refreshing roll source...", () =>
          refreshRollSourceWithFallback()
        );

        if (refreshed.usedCache) {
          const reason = refreshed.refreshError ?? "unknown error";
          console.log(
            chalk.yellow(
              `! Refresh failed (${reason}). Using cached wishlist from ${formatUnixTimestamp(refreshed.state.cacheUpdatedAt)}.`
            )
          );
          return;
        }

        console.log(
          success(`Refreshed roll source "${refreshed.state.sourceInput}"`)
        );
        console.log(
          dim(
            `Cached ${refreshed.wishlist.entries.length} entries at ${formatUnixTimestamp(refreshed.state.cacheUpdatedAt)}.`
          )
        );
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  rolls
    .command("find")
    .description("Find weapons that can roll specific perk combinations")
    .requiredOption(
      "--perk <perk>",
      "Perk name (repeat this flag to require multiple perks)",
      collectPerkFlag,
      []
    )
    .option("--archetype <name>", "Filter by weapon archetype (e.g. hand cannon)")
    .option("--json", "Output results as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => ensureManifest());

        const perkQueries = (opts.perk as string[])
          .map((value) => value.trim())
          .filter((value) => value.length > 0);

        if (perkQueries.length === 0) {
          throw new Error("At least one --perk value is required");
        }

        const resolvedGroups = perkQueries.map((query) => resolvePerkGroup(query));
        const perkGroups = resolvedGroups.map((group) => group.perkHashes);

        const matches = findWeaponsByPerkGroups(perkGroups, opts.archetype);
        const rows = matches.map((weapon) => ({
          hash: weapon.hash,
          name: weapon.name,
          archetype: weapon.archetype,
          tier: weapon.tierTypeName,
          matchedPerks: matchedPerkNamesForWeapon(weapon.perkHashes, resolvedGroups),
        }));

        if (opts.json) {
          console.log(JSON.stringify(rows, null, 2));
          return;
        }

        console.log(
          header(
            `\nRoll Finder — ${resolvedGroups.map((group) => group.query).join(" + ")}`
          )
        );

        if (rows.length === 0) {
          console.log(dim("No weapons found for this perk combination."));
          return;
        }

        const table = new Table({
          head: [
            chalk.bold("Weapon"),
            chalk.bold("Archetype"),
            chalk.bold("Tier"),
            chalk.bold("Matched Perks"),
          ],
          style: { head: [], border: ["dim"] },
          colWidths: [36, 20, 12, 36],
        });

        for (const row of rows) {
          table.push([
            row.name,
            row.archetype,
            row.tier,
            row.matchedPerks.join(", "),
          ]);
        }

        console.log(table.toString());
        console.log(chalk.dim(`\n${rows.length} weapon(s) matched.`));
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });

  rolls
    .command("appraise")
    .description("Grade all weapons against a wishlist")
    .option(
      "--source <file|url|name>",
      "Wishlist source (voltron|choosy|file|url). Uses configured source when omitted."
    )
    .option("--character <class>", "Filter to a specific character (titan/hunter/warlock)")
    .option("--json", "Output results as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => ensureManifest());

        const components = [
          ...getRequiredComponents(),
          DestinyComponentType.ItemPerks,
        ];

        const [profile, wishlistResult] = await Promise.all([
          withSpinner("Fetching inventory...", () => getProfile(components)),
          withSpinner("Loading wishlist...", () =>
            loadWishlistForAppraise(opts.source)
          ),
        ]);
        const wishlist = wishlistResult.wishlist;

        if (wishlistResult.usedCache) {
          const reason = wishlistResult.refreshError
            ? ` (${wishlistResult.refreshError})`
            : "";
          console.error(
            chalk.yellow(
              `! Wishlist refresh failed${reason}. Using cached source "${wishlistResult.sourceLabel}" from ${formatUnixTimestamp(wishlistResult.cacheUpdatedAt)}.`
            )
          );
        }

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
