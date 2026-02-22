import { writeFile } from "fs/promises";
import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import * as manifestCache from "../services/manifest-cache.ts";
import {
  buildInventoryIndex,
  getRequiredComponents,
  type IndexedItem,
} from "../services/item-index.ts";
import { parseQuery } from "../services/search.ts";
import * as localDb from "../services/local-db.ts";
import {
  buildOrganizeReport,
  cleanupSuggestionsToCsv,
  type CleanupSuggestion,
  type OrganizeGroupKey,
} from "../services/organizer.ts";
import { className, dim, error, header, success } from "../ui/format.ts";
import { withSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";

const GROUP_LABELS: Record<OrganizeGroupKey, string> = {
  duplicates: "Duplicate Copies",
  underpowered: "Underpowered Gear",
  vault: "Vault Prep",
};

function resolveCharacter(
  characters: CharacterData[],
  query: string
): CharacterData {
  const lower = query.toLowerCase();
  const match = characters.find(
    (char) => className(char.classType).toLowerCase() === lower
  );
  if (!match) {
    throw new Error(
      `Character "${query}" not found. Available: ${characters
        .map((char) => className(char.classType).toLowerCase())
        .join(", ")}`
    );
  }
  return match;
}

function toCharacterMap(characters: CharacterData[]): Map<string, CharacterData> {
  return new Map(characters.map((char) => [char.characterId, char]));
}

function locationLabel(location: string, byId: Map<string, CharacterData>): string {
  if (location === "vault") {
    return "Vault";
  }
  const character = byId.get(location);
  return className(character?.classType ?? -1);
}

function serializeSuggestion(
  suggestion: CleanupSuggestion,
  byId: Map<string, CharacterData>
) {
  return {
    ...suggestion,
    location: locationLabel(suggestion.location, byId),
  };
}

function renderGroup(
  group: OrganizeGroupKey,
  suggestions: CleanupSuggestion[],
  byId: Map<string, CharacterData>
): void {
  if (suggestions.length === 0) return;

  console.log(header(`\n${GROUP_LABELS[group]} (${suggestions.length})`));
  for (const item of suggestions) {
    const powerText = item.power === null ? "-" : String(item.power);
    const where = locationLabel(item.location, byId);
    console.log(
      `- ${item.name} [${item.slot}] p${powerText} @ ${where} -> ${item.action}`
    );
    console.log(dim(`  ${item.reason}`));
  }
}

function applyQueryFilter(items: IndexedItem[], query: string): IndexedItem[] {
  const predicate = parseQuery(query);
  const allTags =
    typeof localDb.getAllTags === "function"
      ? localDb.getAllTags()
      : new Map<string, string[]>();
  return items.filter((item) => {
    const resolvedItemKey =
      typeof localDb.itemKey === "function"
        ? localDb.itemKey(item)
        : item.instanceId ?? `hash:${item.hash}`;
    return predicate(item, allTags.get(resolvedItemKey) ?? []);
  });
}

export function registerOrganizeCommand(program: Command) {
  program
    .command("organize")
    .description("Analyze your inventory and group cleanup actions")
    .option("--query <dsl>", "Filter items with search DSL before analysis")
    .option("--character <class>", "Limit analysis to a character (titan/hunter/warlock)")
    .option("--csv <path>", "Write cleanup actions to CSV")
    .option("--json", "Output cleanup report as JSON")
    .action(async (opts) => {
      try {
        await withSpinner("Loading manifest...", () => manifestCache.ensureManifest());

        const profile = await withSpinner("Fetching inventory...", () =>
          getProfile(getRequiredComponents())
        );

        const characters = Object.values(
          profile.characters?.data ?? {}
        ) as CharacterData[];
        const byCharacterId = toCharacterMap(characters);
        const index = buildInventoryIndex(profile, characters);

        let scopedItems = index.all;
        let scopedCharacter: CharacterData | null = null;

        if (opts.character) {
          scopedCharacter = resolveCharacter(characters, opts.character);
          scopedItems = index.byCharacter.get(scopedCharacter.characterId) ?? [];
        }

        if (opts.query) {
          scopedItems = applyQueryFilter(scopedItems, opts.query);
        }

        const report = buildOrganizeReport(scopedItems);

        if (opts.csv) {
          const csv = cleanupSuggestionsToCsv(report, (location) =>
            locationLabel(location, byCharacterId)
          );
          await writeFile(opts.csv, csv, "utf8");
        }

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                scope: {
                  query: opts.query ?? null,
                  character: scopedCharacter
                    ? className(scopedCharacter.classType)
                    : null,
                  itemCount: scopedItems.length,
                },
                groups: {
                  duplicates: report.groups.duplicates.map((item) =>
                    serializeSuggestion(item, byCharacterId)
                  ),
                  underpowered: report.groups.underpowered.map((item) =>
                    serializeSuggestion(item, byCharacterId)
                  ),
                  vault: report.groups.vault.map((item) =>
                    serializeSuggestion(item, byCharacterId)
                  ),
                },
                totalSuggestions: report.totalSuggestions,
              },
              null,
              2
            )
          );
          return;
        }

        if (report.totalSuggestions === 0) {
          console.log(dim("No cleanup actions found for current filters."));
        } else {
          renderGroup("duplicates", report.groups.duplicates, byCharacterId);
          renderGroup("underpowered", report.groups.underpowered, byCharacterId);
          renderGroup("vault", report.groups.vault, byCharacterId);
          console.log(
            `\n${report.totalSuggestions} cleanup action(s) across ${scopedItems.length} item(s).`
          );
        }

        if (opts.csv) {
          console.log(success(`Wrote cleanup CSV to ${opts.csv}`));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
