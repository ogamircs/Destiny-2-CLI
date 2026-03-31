import { Command } from "commander";
import Table from "cli-table3";
import chalk from "chalk";
import * as rollSource from "../services/roll-source.ts";
import * as popularity from "../services/popularity.ts";
import { analyzeLoadout } from "../services/optimizer.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { className, dim, header } from "../ui/format.ts";
import { withSpinner } from "../ui/spinner.ts";
import { loadInventoryContext, resolveCharacter, runCommandAction } from "./shared.ts";

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
    .action(runCommandAction(async (opts) => {
      const [{ characters, index }, wishlistResult] = await Promise.all([
        loadInventoryContext({
          additionalComponents: [DestinyComponentType.ItemPerks],
        }),
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

      const character = resolveCharacter(characters, opts.character);

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
    }));
}
