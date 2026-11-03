export type GameId = "d1" | "d2";

let game: GameId = "d2";
let platformOverride: number | undefined;

export function getGame(): GameId {
  return game;
}

export function setGame(next: GameId): void {
  game = next;
}

export function getPlatformOverride(): number | undefined {
  return platformOverride;
}

export function setPlatformOverride(membershipType: number | undefined): void {
  platformOverride = membershipType;
}

export function parseGame(value: string): GameId {
  const normalized = value.trim().toLowerCase();
  if (normalized === "d1" || normalized === "destiny1" || normalized === "1") {
    return "d1";
  }
  if (normalized === "d2" || normalized === "destiny2" || normalized === "2") {
    return "d2";
  }
  throw new Error(`Unknown game "${value}". Use d1 or d2.`);
}

const PLATFORM_TYPES: Record<string, number> = {
  xbox: 1,
  xbl: 1,
  playstation: 2,
  psn: 2,
  ps: 2,
  steam: 3,
  blizzard: 4,
  bnet: 4,
  stadia: 5,
  epic: 6,
  egs: 6,
};

export function parsePlatform(value: string): number {
  const membershipType = PLATFORM_TYPES[value.trim().toLowerCase()];
  if (membershipType === undefined) {
    throw new Error(
      `Unknown platform "${value}". Destiny 1 uses xbox or psn.`
    );
  }
  return membershipType;
}

export function platformName(membershipType: number): string {
  switch (membershipType) {
    case 1:
      return "Xbox";
    case 2:
      return "PlayStation";
    case 3:
      return "Steam";
    case 4:
      return "Battle.net";
    case 5:
      return "Stadia";
    case 6:
      return "Epic";
    default:
      return `platform ${membershipType}`;
  }
}

export function isDestiny1Platform(membershipType: number): boolean {
  return membershipType === 1 || membershipType === 2;
}
