import { Command } from "commander";
import Table from "cli-table3";
import chalk from "chalk";
import { getProfile, type CharacterData } from "../api/profile.ts";
import * as manifestCache from "../services/manifest-cache.ts";
import { buildInventoryIndex, getRequiredComponents } from "../services/item-index.ts";
import * as rollSource from "../services/roll-source.ts";
import * as popularity from "../services/popularity.ts";
import { analyzeLoadout } from "../services/optimizer.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { className, dim, error, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { withSpinner } from "../ui/spinner.ts";

function resolveCharacter(
  characters: CharacterData[],
  classArg: string
): CharacterData {
  const lower = classArg.toLowerCase();
  const char = characters.find(
    (character) => className(character.classType).toLowerCase() === lower
  );

  if (!char) {
    throw new Error(
      `Character "${classArg}" not found. Available: ${characters
        .map((character) => className(character.classType).toLowerCase())
        .join(", ")}`
    );
  }

  return char;
}

export function registerOptimizerCommand(program: Command): void {
  const optimizer = program
    .command("optimizer")
    .description("Analyze loadouts and suggest higher-scoring slot upgrades");

  optimizer
    .command("analyze")
    .description("Analyze your equipped slots and recommend best candidates by slot")
    .requiredOption("--character <class>", "Character class (titan/hunter/warlock)")
    .option(
      "--source <file|url|name>",
      "Wishlist source (voltron|choosy|file|url). Uses configured source when omitted."
    )
    .option(
      "--with-popularity",
      "Overlay optional popularity weighting on top of deterministic wishlist scoring"
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

        if (wishlistResult.usedCache) {
          const reason = wishlistResult.refreshError
            ? ` (${wishlistResult.refreshError})`
            : "";
          console.error(
            chalk.yellow(
              `! Wishlist refresh failed${reason}. Using cached source "${wishlistResult.sourceLabel}" from ${new Date((wishlistResult.cacheUpdatedAt ?? 0) * 1000).toLocaleString()}.`
            )
          );
        }

        let popularityDataset = null;
        if (opts.withPopularity) {
          popularityDataset = await withSpinner("Loading popularity source...", () =>
            popularity.loadPopularitySource(opts.popularitySource)
          );
        }

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];
        const character = resolveCharacter(characters, opts.character);
        const index = buildInventoryIndex(profile, characters);

        const analysis = analyzeLoadout(index, {
          character,
          wishlist: wishlistResult.wishlist,
          withPopularity: Boolean(opts.withPopularity),
          popularity: popularityDataset,
        });

        if (opts.json) {
          console.log(JSON.stringify(analysis, null, 2));
          return;
        }

        const table = new Table({
          head: [
            chalk.bold("Slot"),
            chalk.bold("Current"),
            chalk.bold("Suggested"),
            chalk.bold("Score"),
            chalk.bold("Delta"),
            chalk.bold("Reason"),
          ],
          style: { head: [], border: ["dim"] },
          colWidths: [12, 26, 26, 9, 9, 38],
        });

        for (const recommendation of analysis.recommendations) {
          const currentName =
            recommendation.currentItem?.name ??
            chalk.dim("(none equipped)");
          const suggestedName =
            recommendation.suggestedItem?.name ??
            chalk.dim("(no candidate)");

          table.push([
            recommendation.slot,
            currentName,
            suggestedName,
            recommendation.score > 0
              ? `${recommendation.score.toFixed(1)}`
              : "—",
            recommendation.delta !== 0
              ? `${recommendation.delta > 0 ? "+" : ""}${recommendation.delta.toFixed(1)}`
              : "0.0",
            recommendation.reasons[0] ?? "",
          ]);
        }

        console.log(header(`\nLoadout Optimizer — ${className(character.classType)}`));
        console.log(table.toString());
        console.log(
          `\nSummary: ${analysis.summary.improvedSlots}/${analysis.summary.totalSlots} slot(s) can be improved`
        );

        if (opts.withPopularity) {
          console.log(dim("Popularity overlay applied as a secondary weight."));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
