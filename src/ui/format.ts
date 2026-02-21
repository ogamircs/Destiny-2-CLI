import chalk from "chalk";

const TIER_COLORS: Record<string, (s: string) => string> = {
  Exotic: chalk.yellow.bold,
  Legendary: chalk.magenta.bold,
  Rare: chalk.blue,
  Uncommon: chalk.green,
  Common: chalk.white,
  Basic: chalk.gray,
};

export function colorByTier(text: string, tier: string): string {
  const colorFn = TIER_COLORS[tier] || chalk.white;
  return colorFn(text);
}

export function tierLabel(tier: string): string {
  return colorByTier(tier, tier);
}

export function lightLevel(level: number): string {
  if (level >= 2000) return chalk.yellow.bold(String(level));
  if (level >= 1800) return chalk.magenta(String(level));
  return chalk.white(String(level));
}

export function kd(value: number): string {
  const formatted = value.toFixed(2);
  if (value >= 2.0) return chalk.yellow.bold(formatted);
  if (value >= 1.0) return chalk.green(formatted);
  return chalk.red(formatted);
}

export function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function header(text: string): string {
  return chalk.bold.cyan(text);
}

export function dim(text: string): string {
  return chalk.dim(text);
}

export function success(text: string): string {
  return chalk.green(`✓ ${text}`);
}

export function error(text: string): string {
  return chalk.red(`✗ ${text}`);
}

const CLASS_NAMES: Record<number, string> = {
  0: "Titan",
  1: "Hunter",
  2: "Warlock",
};

const RACE_NAMES: Record<number, string> = {
  0: "Human",
  1: "Awoken",
  2: "Exo",
};

const GENDER_NAMES: Record<number, string> = {
  0: "Male",
  1: "Female",
};

export function className(classType: number): string {
  return CLASS_NAMES[classType] || "Unknown";
}

export function raceName(raceType: number): string {
  return RACE_NAMES[raceType] || "Unknown";
}

export function genderName(genderType: number): string {
  return GENDER_NAMES[genderType] || "Unknown";
}

export function timeSince(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
