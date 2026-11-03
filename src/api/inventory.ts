import { apiRequest } from "./client.ts";
import { equipD1Item, transferD1Item } from "./d1/endpoints.ts";
import { loadTokens } from "../services/token-store.ts";
import { resolveActiveMembership } from "../services/membership.ts";
import { getGame } from "../games/context.ts";
import { AuthError } from "../utils/errors.ts";
import { debug } from "../utils/logger.ts";

export async function transferItem(
  itemReferenceHash: number,
  stackSize: number,
  transferToVault: boolean,
  itemId: string,
  characterId: string
): Promise<void> {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError("Not logged in");

  debug(
    `Transfer: hash=${itemReferenceHash} stack=${stackSize} toVault=${transferToVault} itemId=${itemId} char=${characterId}`
  );

  if (getGame() === "d1") {
    const membership = await resolveActiveMembership();
    await transferD1Item({
      itemReferenceHash,
      itemId,
      stackSize,
      transferToVault,
      characterId,
      membershipType: membership.membershipType,
    });
    return;
  }

  await apiRequest("/Destiny2/Actions/Items/TransferItem/", {
    method: "POST",
    body: {
      itemReferenceHash,
      stackSize,
      transferToVault,
      itemId,
      characterId,
      membershipType: tokens.destinyMembershipType,
    },
  });
}

export async function equipItem(
  itemId: string,
  characterId: string
): Promise<void> {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError("Not logged in");

  debug(`Equip: itemId=${itemId} char=${characterId}`);

  if (getGame() === "d1") {
    const membership = await resolveActiveMembership();
    await equipD1Item({
      itemId,
      characterId,
      membershipType: membership.membershipType,
    });
    return;
  }

  await apiRequest("/Destiny2/Actions/Items/EquipItem/", {
    method: "POST",
    body: {
      itemId,
      characterId,
      membershipType: tokens.destinyMembershipType,
    },
  });
}
