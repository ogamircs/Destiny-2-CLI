import { Command } from "commander";
import chalk from "chalk";
import type { CharacterData } from "../api/profile.ts";
import { transferItem } from "../api/inventory.ts";
import { className, success } from "../ui/format.ts";
import { createSpinner } from "../ui/spinner.ts";
import { pickCharacter, pickDestination, pickItem } from "../ui/prompts.ts";
import { formatError } from "../utils/errors.ts";
import { withFreshProfileRetry } from "../services/move-retry.ts";
import { applyRecentLocation, recordRecentMove } from "../services/recent-moves.ts";
import {
  loadInventoryContext,
  resolveCharacter,
  runCommandAction,
  toLocatedItem,
  type LocatedItem,
} from "./shared.ts";

function findItems(
  allItems: Array<Parameters<typeof toLocatedItem>[0]>,
  characters: Map<string, CharacterData>,
  searchQuery: string
): LocatedItem[] {
  const lowerQuery = searchQuery.toLowerCase();

  return allItems
    .filter((item) => item.name.toLowerCase().includes(lowerQuery))
    .map((item) => toLocatedItem(item, characters, { slot: "" }));
}

export function registerTransferCommand(program: Command) {
  program
    .command("transfer")
    .alias("move")
    .argument("<item>", "Item name to search for")
    .description("Transfer an item between characters and vault")
    .option("--to <destination>", "Destination: vault, titan, hunter, warlock")
    .option("--count <n>", "Stack count to transfer", "1")
    .action(runCommandAction(async (itemQuery: string, opts) => {
      const spinner = createSpinner(`Transferring ${chalk.bold(itemQuery)}...`).start();
      try {
        const message = await withFreshProfileRetry(() =>
          transferOnce(itemQuery, opts, (text) => {
            spinner.text = text;
          })
        );
        spinner.succeed(success(message));
      } catch (err) {
        spinner.fail();
        throw new Error(`Transfer failed: ${formatError(err)}`);
      }
    }));
}

async function transferOnce(
  itemQuery: string,
  opts: { to?: string; count?: string },
  setStatus: (text: string) => void
): Promise<string> {
  const { characters, byCharacterId, index } = await loadInventoryContext();
  const matches = findItems(index.all, byCharacterId, itemQuery).map((item) =>
    applyRecentLocation(item)
  );

  if (matches.length === 0) {
    throw new Error(`No items found matching "${itemQuery}"`);
  }

  const selected = matches.length === 1
    ? matches[0]!
    : applyRecentLocation(
        (await pickItem(matches, "Multiple items found. Select one:")) as LocatedItem
      );

  if (selected.isEquipped) {
    throw new Error(
      `${selected.name} is currently equipped. Unequip it first or use: destiny equip`
    );
  }

  let toVault = false;
  let destCharacterId: string | undefined;

  if (opts.to) {
    const toLower = opts.to.toLowerCase();
    if (toLower === "vault") {
      toVault = true;
    } else {
      destCharacterId = resolveCharacter(characters, opts.to).characterId;
    }
  } else {
    const destination = await pickDestination(characters);
    if (destination.type === "vault") {
      toVault = true;
    } else {
      destCharacterId = destination.characterId;
    }
  }

  const count = Number.parseInt(opts.count ?? "1", 10) || 1;
  setStatus(`Transferring ${selected.name}...`);

  const remember = (location: string) => {
    if (!selected.instanceId) return;
    recordRecentMove({
      instanceId: selected.instanceId,
      hash: selected.hash,
      name: selected.name,
      location,
    });
  };

  if (selected.inVault && !toVault) {
    if (!destCharacterId) {
      const destination = await pickCharacter(
        characters,
        "Transfer to which character?"
      );
      destCharacterId = destination.characterId;
    }
    await transferItem(
      selected.hash,
      count,
      false,
      selected.instanceId || "0",
      destCharacterId
    );
    remember(destCharacterId);
  } else if (!selected.inVault && toVault) {
    await transferItem(
      selected.hash,
      count,
      true,
      selected.instanceId || "0",
      selected.characterId!
    );
    remember("vault");
  } else if (!selected.inVault && !toVault && destCharacterId) {
    if (selected.characterId === destCharacterId) {
      return `${selected.name} is already on that character`;
    }
    setStatus(`Moving ${selected.name} to vault...`);
    await transferItem(
      selected.hash,
      count,
      true,
      selected.instanceId || "0",
      selected.characterId!
    );
    remember("vault");

    setStatus(`Moving ${selected.name} from vault...`);
    await transferItem(
      selected.hash,
      count,
      false,
      selected.instanceId || "0",
      destCharacterId
    );
    remember(destCharacterId);
  } else {
    return `${selected.name} is already in the destination`;
  }

  const destName = toVault
    ? "Vault"
    : className(byCharacterId.get(destCharacterId!)!.classType);
  return `${selected.name} transferred to ${destName}`;
}
