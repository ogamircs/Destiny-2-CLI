export const D1_API_BASE = "https://www.bungie.net/d1/Platform";

export function d1Url(path: string): string {
  return `${D1_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function unwrapData(response: unknown): unknown {
  if (response && typeof response === "object" && "data" in response) {
    const data = (response as { data?: unknown }).data;
    if (data && typeof data === "object") return data;
  }
  return response;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
