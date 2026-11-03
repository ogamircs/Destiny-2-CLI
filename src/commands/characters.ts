import { Command } from "commander";
import { getProfile, type CharacterData } from "../api/profile.ts";
import { getGame, platformName } from "../games/context.ts";
import { DestinyComponentType } from "../utils/constants.ts";
import { renderCharacterTable } from "../ui/tables.ts";
import { withSpinner } from "../ui/spinner.ts";
import { formatError } from "../utils/errors.ts";
import { dim, error, header } from "../ui/format.ts";

export function registerCharactersCommand(program: Command) {
  program
    .command("characters")
    .alias("chars")
    .description("List your characters")
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
        const isD1 = getGame() === "d1" || profile.d1 !== undefined;
        renderCharacterTable(characters, isD1 ? undefined : guardianRank, {
          lightColumn: isD1,
        });
        if (profile.d1) {
          console.log(header(`\nGrimoire ${profile.d1.grimoireScore}`));
          console.log(dim(platformName(profile.d1.membershipType)));
        }
      } catch (err) {
        console.error(error(formatError(err)));
        process.exit(1);
      }
    });
}
