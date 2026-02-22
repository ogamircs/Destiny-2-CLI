import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { getProfile, type CharacterData } from "../api/profile.ts";
import * as manifestCache from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import * as localDb from "../services/local-db.ts";
import * as rollSource from "../services/roll-source.ts";
import { gradeItem } from "../services/wishlist.ts";
import type { WishlistGrade } from "../services/wishlist.ts";
import * as popularity from "../services/popularity.ts";
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

const GRADE_BASE_SCORE: Record<WishlistGrade, number> = {
  god: 1,
  good: 0.75,
  trash: 0.15,
  unknown: 0.45,
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

function roundScore(score: number): number {
  return Math.round(score * 1000) / 1000;
}

function parseFinderQuery(query: string): string[][] {
  const groupParts = query
    .split("+")
    .map((group) => group.trim())
    .filter((group) => group.length > 0);

  if (groupParts.length === 0) {
    throw new Error("Query must contain at least one perk");
  }

  const groups = groupParts.map((group) =>
    group
      .split("|")
      .map((term) => term.trim())
      .filter((term) => term.length > 0)
  );

  if (groups.some((group) => group.length === 0)) {
    throw new Error("Each query perk group must include at least one perk");
  }

  return groups;
}

function resolvePerkGroup(query: string): ResolvedPerkGroup {
  const matches = manifestCache.searchPerks(query);
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

function resolvePerkAlternativeGroup(queries: string[]): ResolvedPerkGroup {
  const resolved = queries.map((query) => resolvePerkGroup(query));
  const perkHashes = Array.from(
    new Set(resolved.flatMap((group) => group.perkHashes))
  );
  const perkNames = uniqueStrings(resolved.flatMap((group) => group.perkNames));

  return {
    query: queries.join(" | "),
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
    const perk = manifestCache.lookupPerk(matchedHash);
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

function deterministicFinderScore(tier: string): number {
  switch (tier.toLowerCase()) {
    case "exotic":
      return 0.95;
    case "legendary":
      return 0.8;
    case "rare":
      return 0.6;
    default:
      return 0.5;
  }
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
          () => rollSource.setRollSourceAndRefresh(sourceInput)
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
        const state =
          typeof localDb.getRollSource === "function"
            ? localDb.getRollSource()
            : null;

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
          rollSource.refreshRollSourceWithFallback()
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
    .option(
      "--perk <perk>",
      "Perk name (repeat this flag to require multiple perks)",
      collectPerkFlag,
      []
    )
    .option(
      "--query <query>",
      'Perk query mode. Use "+" for required groups and "|" for alternatives (example: "outlaw|rapid hit + payload")'
    )
    .option("--archetype <name>", "Filter by weapon archetype (e.g. hand cannon)")
    .option(
      "--with-popularity",
      "Overlay optional popularity scores on top of deterministic roll-finder ranking"
    )
    .option(
      "--popularity-source <file|url>",
      "Popularity JSON source (file or URL) for optional score overlay"
    )
    .option("--json", "Output results as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => manifestCache.ensureManifest());

        const perkQueries = (opts.perk as string[])
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
        const queryGroups = opts.query
          ? parseFinderQuery(String(opts.query))
          : [];

        if (perkQueries.length === 0 && queryGroups.length === 0) {
          throw new Error("Provide at least one --perk value or a --query value");
        }

        const resolvedGroups: ResolvedPerkGroup[] = [];
        for (const queryGroup of queryGroups) {
          resolvedGroups.push(resolvePerkAlternativeGroup(queryGroup));
        }

        for (const perkQuery of perkQueries) {
          resolvedGroups.push(resolvePerkGroup(perkQuery));
        }

        const perkGroups = resolvedGroups.map((group) => group.perkHashes);

        let popularityDataset: popularity.PopularityDataset | null = null;
        if (opts.withPopularity) {
          popularityDataset = await withSpinner("Loading popularity source...", () =>
            popularity.loadPopularitySource(opts.popularitySource)
          );
        }

        const matches = manifestCache.findWeaponsByPerkGroups(
          perkGroups,
          opts.archetype
        );
        const rows = matches.map((weapon) => {
          const matchedPerks = matchedPerkNamesForWeapon(
            weapon.perkHashes,
            resolvedGroups
          );
          const baseRow = {
            hash: weapon.hash,
            name: weapon.name,
            archetype: weapon.archetype,
            tier: weapon.tierTypeName,
            matchedPerks,
          };

          if (!opts.withPopularity || !popularityDataset) {
            return baseRow;
          }

          const deterministicScore = deterministicFinderScore(weapon.tierTypeName);
          const popularityScore = popularity.getPopularityScore(
            popularityDataset,
            weapon.hash
          );
          const score = roundScore(
            popularity.blendDeterministicWithPopularity(
              deterministicScore,
              popularityScore ?? undefined,
              0.2
            )
          );

          return {
            ...baseRow,
            popularityScore,
            score,
          };
        });

        if (opts.withPopularity) {
          rows.sort((a, b) => {
            const aScore = (a as { score?: number }).score ?? 0;
            const bScore = (b as { score?: number }).score ?? 0;
            if (aScore !== bScore) {
              return bScore - aScore;
            }
            return a.name.localeCompare(b.name);
          });
        }

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
            ...(opts.withPopularity ? [chalk.bold("Score")] : []),
          ],
          style: { head: [], border: ["dim"] },
          colWidths: opts.withPopularity
            ? [30, 18, 12, 30, 10]
            : [36, 20, 12, 36],
        });

        for (const row of rows) {
          const baseCells = [
            row.name,
            row.archetype,
            row.tier,
            row.matchedPerks.join(", "),
          ];

          if (opts.withPopularity) {
            const scoreLabel =
              (row as { score?: number; popularityScore?: number | null }).score !==
              undefined
                ? `${((row as { score: number }).score * 100).toFixed(1)}%`
                : "—";
            table.push([...baseCells, scoreLabel]);
          } else {
            table.push(baseCells);
          }
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
    .option(
      "--with-popularity",
      "Overlay optional popularity weighting on top of deterministic wishlist grades"
    )
    .option(
      "--popularity-source <file|url>",
      "Popularity JSON source (file or URL) for optional score overlay"
    )
    .option("--json", "Output results as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => manifestCache.ensureManifest());

        const components = [
          ...getRequiredComponents(),
          DestinyComponentType.ItemPerks,
        ];

        const [profile, wishlistResult] = await Promise.all([
          withSpinner("Fetching inventory...", () => getProfile(components)),
          withSpinner("Loading wishlist...", () =>
            rollSource.loadWishlistForAppraise(opts.source)
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

        let popularityDataset: popularity.PopularityDataset | null = null;
        if (opts.withPopularity) {
          popularityDataset = await withSpinner("Loading popularity source...", () =>
            popularity.loadPopularitySource(opts.popularitySource)
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
          const deterministicScore = GRADE_BASE_SCORE[grade];
          const popularityScore =
            opts.withPopularity && popularityDataset
              ? popularity.getPopularityScore(popularityDataset, item.hash)
              : null;
          const score = roundScore(
            popularity.blendDeterministicWithPopularity(
              deterministicScore,
              popularityScore ?? undefined,
              opts.withPopularity ? 0.15 : 0
            )
          );

          // Resolve perk names for matched perks
          const matchedPerks: string[] = [];
          if (item.perks) {
            for (const ph of item.perks) {
              const perk = manifestCache.lookupPerk(ph);
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

          return {
            item,
            grade,
            score,
            popularityScore,
            matchedPerks,
            notes,
          };
        });

        // Deterministic grade remains primary. Popularity only refines ordering within grade.
        graded.sort((a, b) => {
          const gradeOrder = GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade];
          if (gradeOrder !== 0) {
            return gradeOrder;
          }

          if (a.score !== b.score) {
            return b.score - a.score;
          }

          return a.item.name.localeCompare(b.item.name);
        });

        if (opts.json) {
          const out = graded.map(
            ({ item, grade, matchedPerks, notes, score, popularityScore }) => ({
            name: item.name,
            tier: item.tier,
            slot: item.slot,
            power: item.power,
            grade,
            score,
            popularityScore,
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
            chalk.bold("Score"),
          ],
          style: { head: [], border: ["dim"] },
          colWidths: [8, 30, 10, 10, 7, 28, 26, 9],
        });

        for (const { item, grade, matchedPerks, notes, score } of graded) {
          table.push([
            gradeLabel(grade),
            item.name,
            item.tier,
            item.slot,
            item.power !== undefined ? String(item.power) : "—",
            matchedPerks.slice(0, 3).join(", "),
            notes.slice(0, 50),
            `${(score * 100).toFixed(1)}%`,
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
