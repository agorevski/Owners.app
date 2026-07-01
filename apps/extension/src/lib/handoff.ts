/**
 * Compliant "Continue to Amazon" handoff (docs/01 Flow S5, docs/09 section 8).
 *
 * v0 commerce posture: NO affiliate tag, NO link replacement, NO page reload for
 * attribution. The handoff opens the normal Amazon product page. This module guarantees
 * the generated/normalized URL never carries an affiliate tag or attribution parameter,
 * and never overwrites an existing one ("last-click" is respected — we simply don't add).
 */

/** Query params commonly used for affiliate attribution; stripped in v0. */
const AFFILIATE_PARAMS = [
  "tag",
  "ascsubtag",
  "ref_",
  "linkcode",
  "linkid",
  "creative",
  "creativeasin",
  "camp",
  "smid",
  "th",
  "psc",
];

const AMAZON_ORIGIN = "https://www.amazon.com";

/** True if a URL carries any known affiliate/attribution parameter. */
export function hasAffiliateTag(url: string): boolean {
  try {
    const u = new URL(url, AMAZON_ORIGIN);
    for (const key of u.searchParams.keys()) {
      if (AFFILIATE_PARAMS.includes(key.toLowerCase())) return true;
    }
    return false;
  } catch {
    return /[?&]tag=/i.test(url);
  }
}

/** Remove affiliate/attribution params from an existing URL without altering the path. */
export function stripAffiliateParams(url: string): string {
  const u = new URL(url, AMAZON_ORIGIN);
  for (const key of Array.from(u.searchParams.keys())) {
    if (AFFILIATE_PARAMS.includes(key.toLowerCase())) u.searchParams.delete(key);
  }
  return u.toString();
}

/**
 * Build the v0 handoff URL for an ASIN: a clean canonical product URL with no affiliate
 * tag. Never reloads the current page and never injects attribution.
 */
export function buildAmazonHandoffUrl(asin: string): string {
  return `${AMAZON_ORIGIN}/dp/${encodeURIComponent(asin)}`;
}
