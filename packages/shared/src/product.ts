/**
 * Product resolution helpers (pure, dependency-free).
 *
 * See docs/09-mvp-implementation-spec.md section 4 — Amazon earbuds product resolution.
 */

/** Amazon ASIN format: 10 alphanumeric chars, conventionally starting with "B0". */
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

export function isValidAsin(value: string): boolean {
  return ASIN_PATTERN.test(value.trim().toUpperCase());
}

export function normalizeAsin(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Canonical grouping key: prefer the parent/variation ASIN when Amazon exposes it,
 * otherwise fall back to the exact ASIN (provisional product path).
 */
export function canonicalGroupingKey(asin: string, parentAsin?: string): string {
  const normalizedParent = parentAsin ? normalizeAsin(parentAsin) : undefined;
  if (normalizedParent && isValidAsin(normalizedParent)) {
    return normalizedParent;
  }
  return normalizeAsin(asin);
}

/**
 * Whether a resolved product should be treated as provisional (exact-ASIN only,
 * no parent/variation data) and therefore routed to the admin merge queue.
 */
export function isProvisionalResolution(parentAsin?: string): boolean {
  return !parentAsin || !isValidAsin(normalizeAsin(parentAsin));
}

/** v0 supports a single product category. */
export const V0_PRODUCT_CATEGORY = "earbuds" as const;

/** Resolution confidence heuristic: parent-grouped products are more trustworthy. */
export const RESOLUTION_CONFIDENCE = {
  canonical: 0.9,
  provisional: 0.5,
} as const;

/** Pure outcome of resolving an Amazon ASIN (+ optional parent) into a canonical grouping. */
export interface ProductResolution {
  asin: string;
  parentAsin?: string;
  /** Key used to cluster variants; parent ASIN when available, else the exact ASIN. */
  canonicalKey: string;
  provisional: boolean;
  confidence: number;
}

/**
 * Resolve an Amazon ASIN (with optional parent/variation ASIN) into a canonical grouping
 * decision. Storage-agnostic: callers use `canonicalKey` to look up or create the
 * `canonical_products` row, and `provisional` to route to the admin merge queue.
 */
export function resolveAmazonProduct(asin: string, parentAsin?: string): ProductResolution {
  const normalizedAsin = normalizeAsin(asin);
  const hasValidParent = !!parentAsin && isValidAsin(normalizeAsin(parentAsin));
  const provisional = !hasValidParent;
  return {
    asin: normalizedAsin,
    ...(hasValidParent ? { parentAsin: normalizeAsin(parentAsin as string) } : {}),
    canonicalKey: canonicalGroupingKey(normalizedAsin, parentAsin),
    provisional,
    confidence: provisional ? RESOLUTION_CONFIDENCE.provisional : RESOLUTION_CONFIDENCE.canonical,
  };
}

