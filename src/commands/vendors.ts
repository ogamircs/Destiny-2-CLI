import { Command } from "commander";
import { getProfile } from "../api/profile.ts";
import {
  getCharacterVendors,
  VendorComponentType,
  type CharacterVendorsResponse,
} from "../api/progression.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { withSpinner } from "../ui/spinner.ts";
import { error, header } from "../ui/format.ts";
import { formatError } from "../utils/errors.ts";
import { buildVendorsReport } from "../services/progression.ts";
import { loadD1Advisors } from "../services/d1-views.ts";
import { vendorNameFromParts } from "../services/definition-name.ts";
import {
  ensureManifest,
  lookupManifestName,
  lookupVendorDisplayItemHash,
} from "../services/manifest-cache.ts";
import { getGame } from "../games/context.ts";

const VENDOR_COMPONENTS = [
  VendorComponentType.Vendors,
  VendorComponentType.VendorSales,
  VendorComponentType.VendorCategories,
];

export function registerVendorsCommand(program: Command) {
  program
    .command("vendors")
    .description("List featured vendors and category availability summary")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        if (getGame() === "d1") {
          const advisors = await withSpinner("Fetching Destiny 1 advisors...", () =>
            loadD1Advisors()
          );
          if (opts.json) {
            console.log(JSON.stringify({ advisors }, null, 2));
            return;
          }
          console.log(header("\nDestiny 1 Advisors"));
          console.log(
            "The Destiny 1 vendor inventory endpoint is retired, so this lists advisor activities instead."
          );
          for (const character of advisors) {
            console.log(header(`\n${character.className}`));
            if (character.activities.length === 0) {
              console.log("No advisor activities returned.");
              continue;
            }
            for (const activity of character.activities) {
              const state =
                activity.active === null ? "" : activity.active ? " [active]" : " [inactive]";
              console.log(`${activity.name}${state}`);
              if (activity.about) console.log(`  ${activity.about}`);
            }
          }
          return;
        }

        await withSpinner("Loading manifest...", () => ensureManifest());
        const profile = await withSpinner("Fetching characters...", () =>
          getProfile([DestinyComponentType.Characters])
        );
        const characters = Object.values(profile.characters?.data ?? {});

        const vendorResponses = await withSpinner("Fetching vendors...", () =>
          Promise.all(
            characters.map(async (character) => ({
              characterId: character.characterId,
              classType: character.classType,
              response: (await getCharacterVendors(
                character.characterId,
                VENDOR_COMPONENTS
              )) as CharacterVendorsResponse,
            }))
          )
        );

        const report = buildVendorsReport(vendorResponses, (vendorHash) => {
          const displayItemHash = lookupVendorDisplayItemHash(vendorHash);
          return vendorNameFromParts(
            lookupManifestName("DestinyVendorDefinition", vendorHash),
            displayItemHash
              ? lookupManifestName("DestinyInventoryItemDefinition", displayItemHash)
              : null
          );
        });

        if (opts.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }

        console.log(header("\nFeatured Vendors"));
        console.log(
          `Characters: ${report.summary.characterCount} | Vendors: ${report.summary.vendorCount}`
        );
        console.log(
          `Categories: ${report.summary.categoryCount} | Sale items: ${report.summary.saleItemCount}`
        );
        for (const vendor of report.vendors) {
          if (/^Vendor \d+$/.test(vendor.vendorLabel)) continue;
          const refresh = vendor.nextRefreshDate ?? "unknown";
          console.log(
            `${vendor.vendorLabel} | classes: ${vendor.characters.join(", ")} | categories: ${vendor.categoryCount} | items: ${vendor.saleItemCount} | refresh: ${refresh}`
          );
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
