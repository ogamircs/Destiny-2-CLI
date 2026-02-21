import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { renderCharacterTable } from "../ui/tables.ts";
import { withSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";
import { error } from "../ui/format.ts";

export function registerCharactersCommand(program: Command) {
  program
    .command("characters")
    .alias("chars")
    .description("List your Destiny 2 characters")
    .action(async () => {
      try {
        const profile = await withSpinner("Fetching characters...", () =>
          getProfile([DestinyComponentType.Profiles, DestinyComponentType.Characters])
        );

        if (!profile.characters?.data) {
          console.log(error("No characters found"));
          return;
        }

        const characters = Object.values(
          profile.characters.data
        ) as CharacterData[];

        // Sort by last played
        characters.sort(
          (a, b) =>
            new Date(b.dateLastPlayed).getTime() -
            new Date(a.dateLastPlayed).getTime()
        );

        const guardianRank = profile.profile?.data.currentGuardianRank;
        renderCharacterTable(characters, guardianRank);
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
