export const API_BASE = "https://www.bungie.net/Platform";
export const AUTH_URL = "https://www.bungie.net/en/OAuth/Authorize";
export const TOKEN_URL = "https://www.bungie.net/Platform/App/OAuth/Token/";
export const OAUTH_CALLBACK_PORT = 3847;
export const OAUTH_CALLBACK_PATH = "/callback";

// Bungie API rate limit
export const RATE_LIMIT_PER_SECOND = 25;

// Profile component flags (bitmask values from Bungie API)
export const DestinyComponentType = {
  Profiles: 100,
  Characters: 200,
  CharacterInventories: 201,
  CharacterEquipment: 205,
  ProfileInventories: 102,
  ItemInstances: 300,
  ItemStats: 304,
  ItemPerks: 302,
  CharacterActivities: 204,
  Metrics: 1100,
} as const;

// Common bucket hashes for item slots
export const BucketHash = {
  Kinetic: 1498876634,
  Energy: 2465295065,
  Power: 953998645,
  Helmet: 3448274439,
  Gauntlets: 3551918588,
  Chest: 14239492,
  Legs: 20886954,
  ClassItem: 1585787867,
  Ghost: 4023194814,
  Vehicle: 2025709351,
  Ship: 284967655,
  Subclass: 3284755031,
  General: 138197802,
  Vault: 138197802,
  Consumables: 1469714392,
  Modifications: 3313201758,
  Postmaster: 215593132,
  Emblem: 4274335291,
  Finisher: 3683254069,
} as const;

export const BUCKET_SLOT_NAMES: Record<number, string> = {
  [BucketHash.Kinetic]: "Kinetic",
  [BucketHash.Energy]: "Energy",
  [BucketHash.Power]: "Power",
  [BucketHash.Helmet]: "Helmet",
  [BucketHash.Gauntlets]: "Gauntlets",
  [BucketHash.Chest]: "Chest",
  [BucketHash.Legs]: "Legs",
  [BucketHash.ClassItem]: "Class Item",
  [BucketHash.Ghost]: "Ghost",
  [BucketHash.Vehicle]: "Vehicle",
  [BucketHash.Ship]: "Ship",
  [BucketHash.Subclass]: "Subclass",
  [BucketHash.Consumables]: "Consumables",
  [BucketHash.Modifications]: "Modifications",
  [BucketHash.Emblem]: "Emblem",
};

export const WEAPON_BUCKETS = [
  BucketHash.Kinetic,
  BucketHash.Energy,
  BucketHash.Power,
];

export const ARMOR_BUCKETS = [
  BucketHash.Helmet,
  BucketHash.Gauntlets,
  BucketHash.Chest,
  BucketHash.Legs,
  BucketHash.ClassItem,
];
