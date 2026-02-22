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

        const report = buildVendorsReport(vendorResponses);

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
