/**
 * Order-id hashing for privacy-preserving duplicate/fraud detection.
 *
 * docs/09 section 3 (Evidence stored): store a HASHED order id, never the raw order id.
 * The raw id is read transiently in page context only to compute the hash and is then
 * discarded; it is never stored, logged, or transmitted.
 */

const PREFIX = "sha256:";

/** Extract a canonical Amazon order id (e.g. "123-4567890-1234567") from arbitrary text. */
export function extractOrderId(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const match = text.match(/\b\d{3}-\d{7}-\d{7}\b/);
  return match?.[0];
}

/** SHA-256 hash an order id, returning a prefixed hex digest. Raw input is not retained. */
export async function hashOrderId(rawOrderId: string): Promise<string> {
  const bytes = new TextEncoder().encode(rawOrderId.trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${PREFIX}${hex}`;
}

export function isHashedOrderId(value: string | undefined): boolean {
  return !!value && value.startsWith(PREFIX) && /^[0-9a-f]{64}$/.test(value.slice(PREFIX.length));
}
