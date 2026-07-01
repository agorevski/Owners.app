/**
 * Amazon page identifier extraction (minimal, privacy-preserving).
 *
 * Per docs/09 section 7 and docs/04: extract only the identifiers needed for canonical
 * product resolution. Never read price, rating, reviews, cart, or checkout DOM.
 */

import { isValidAsin, normalizeAsin } from "@owners/shared";

/** Extract an ASIN from a product detail URL, e.g. /dp/B0XXXXXXXX or /gp/product/B0XXXXXXXX. */
export function extractAsinFromUrl(url: string): string | undefined {
  const match = url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
  const candidate = match?.[1];
  if (candidate && isValidAsin(candidate)) {
    return normalizeAsin(candidate);
  }
  return undefined;
}

/** Best-effort parent/variation ASIN read from an in-page data attribute if present. */
export function extractParentAsin(doc: Document): string | undefined {
  const el = doc.querySelector<HTMLElement>("[data-parent-asin]");
  const value = el?.dataset.parentAsin;
  if (value && isValidAsin(value)) {
    return normalizeAsin(value);
  }
  return undefined;
}

/** True for Amazon.com product detail pages only. */
export function isProductDetailPage(url: string): boolean {
  return /:\/\/(www|smile)\.amazon\.com\/.*\/(dp|gp\/product|gp\/aw\/d)\//i.test(url) ||
    /:\/\/(www|smile)\.amazon\.com\/(dp|gp\/product|gp\/aw\/d)\//i.test(url);
}
