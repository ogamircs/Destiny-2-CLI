import { apiRequest } from "./client.ts";
import { debug } from "../utils/logger.ts";

interface ManifestResponse {
  version: string;
  mobileWorldContentPaths: Record<string, string>;
}

export async function getManifestInfo(): Promise<ManifestResponse> {
  debug("Fetching manifest info");
  return apiRequest<ManifestResponse>("/Destiny2/Manifest/", { auth: false });
}

export function getManifestDbUrl(manifest: ManifestResponse): string {
  const path =
    manifest.mobileWorldContentPaths["en"] ||
    Object.values(manifest.mobileWorldContentPaths)[0];
  if (!path) throw new Error("No manifest DB path found");
  return `https://www.bungie.net${path}`;
}
