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
