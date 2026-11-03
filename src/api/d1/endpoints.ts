import { apiRequest } from "../client.ts";
import type { ManifestResponse } from "../manifest.ts";
import { d1Url, unwrapData } from "./paths.ts";

export interface DestinyMembershipRef {
  membershipType: number;
  membershipId: string;
}

export async function getD1ManifestInfo(): Promise<ManifestResponse> {
  return apiRequest<ManifestResponse>(d1Url("/Destiny/Manifest/"), { auth: false });
}

export async function getD1Account(membership: DestinyMembershipRef): Promise<unknown> {
  return apiRequest(
    d1Url(`/Destiny/${membership.membershipType}/Account/${membership.membershipId}/`)
  );
}

export async function getD1CharacterInventory(
  membership: DestinyMembershipRef,
  characterId: string
): Promise<unknown> {
  return apiRequest(
    d1Url(
      `/Destiny/${membership.membershipType}/Account/${membership.membershipId}/Character/${characterId}/Inventory/`
    )
  );
}

export async function getD1Vault(membershipType: number): Promise<unknown> {
  return apiRequest(d1Url(`/Destiny/${membershipType}/MyAccount/Vault/`));
}

export async function getD1Progression(
  membership: DestinyMembershipRef,
  characterId: string
): Promise<unknown> {
  const response = await apiRequest(
    d1Url(
      `/Destiny/${membership.membershipType}/Account/${membership.membershipId}/Character/${characterId}/Progression/`
    )
  );
  return unwrapData(response);
}

export async function getD1Advisors(
  membership: DestinyMembershipRef,
  characterId: string
): Promise<unknown> {
  const response = await apiRequest(
    d1Url(
      `/Destiny/${membership.membershipType}/Account/${membership.membershipId}/Character/${characterId}/Advisors/V2/`
    )
  );
  return unwrapData(response);
}

export async function getD1Grimoire(membership: DestinyMembershipRef): Promise<unknown> {
  const response = await apiRequest(
    d1Url(
      `/Destiny/Vanguard/Grimoire/${membership.membershipType}/${membership.membershipId}/`
    )
  );
  return unwrapData(response);
}

export async function transferD1Item(body: {
  itemReferenceHash: number;
  itemId: string;
  stackSize: number;
  transferToVault: boolean;
  characterId: string;
  membershipType: number;
}): Promise<void> {
  await apiRequest(d1Url("/Destiny/TransferItem/"), { method: "POST", body });
}

export async function equipD1Item(body: {
  itemId: string;
  characterId: string;
  membershipType: number;
}): Promise<void> {
  await apiRequest(d1Url("/Destiny/EquipItem/"), { method: "POST", body });
}

export async function getD1HistoricalStats(
  membership: DestinyMembershipRef,
  modeName: string | null
): Promise<unknown> {
  if (!modeName) {
    return apiRequest(
      d1Url(
        `/Destiny/Stats/Account/${membership.membershipType}/${membership.membershipId}/?groups=General`
      )
    );
  }
  return apiRequest(
    d1Url(
      `/Destiny/Stats/${membership.membershipType}/${membership.membershipId}/0/?modes=${modeName}&groups=General&periodType=AllTime`
    )
  );
}
