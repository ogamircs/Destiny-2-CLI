import type { CharacterData } from "../api/profile.ts";
import { className } from "../ui/format.ts";

function describe(characters: CharacterData[]): string {
  return characters
    .map((character) => className(character.classType).toLowerCase())
    .join(", ");
}

export function resolveCharacter(
  characters: CharacterData[],
  classArg: string
): CharacterData {
  const query = classArg.trim();
  const lower = query.toLowerCase();

  const exactId = characters.find((character) => character.characterId === query);
  if (exactId) return exactId;

  const byClass = characters.filter(
    (character) => className(character.classType).toLowerCase() === lower
  );
  if (byClass.length === 1) return byClass[0]!;
  if (byClass.length > 1) {
    const ids = byClass
      .map((character) => `${character.characterId} (last played ${character.dateLastPlayed})`)
      .join(", ");
    throw new Error(
      `Multiple ${className(byClass[0]!.classType).toLowerCase()} characters match "${query}". Pass a character id: ${ids}`
    );
  }

  if (query.length >= 4) {
    const byPrefix = characters.filter((character) =>
      character.characterId.startsWith(query)
    );
    if (byPrefix.length === 1) return byPrefix[0]!;
  }

  throw new Error(
    `Character "${query}" not found. Available: ${describe(characters)}`
  );
}
