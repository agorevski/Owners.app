/**
 * Amazon Orders verification scanner (injected on explicit user action only).
 *
 * This script is NOT declared in the manifest content_scripts. The service worker injects
 * it via chrome.scripting.executeScript after the owner starts verification and confirms
 * the evidence explanation, honoring the user-initiated constraint in docs/09 section 3.
 *
 * It reads only visible order rows to identify earbud ownership, filters locally, and
 * returns the minimal normalized evidence payload. It must not read credentials, payment,
 * shipping address, price, or the full order id.
 *
 * TODO(extension-agent): implement earbud detection heuristics and the consent preview.
 */

import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";
import { extractAsinFromUrl } from "../lib/amazon";
import { EXTENSION_VERSION } from "../lib/messages";

export function scanOrdersPage(doc: Document = document): SubmitOwnershipEvidenceRequest[] {
  const evidence: SubmitOwnershipEvidenceRequest[] = [];
  const links = doc.querySelectorAll<HTMLAnchorElement>("a[href*='/dp/'], a[href*='/gp/product/']");

  const seen = new Set<string>();
  for (const link of links) {
    const asin = extractAsinFromUrl(link.href);
    if (!asin || seen.has(asin)) continue;
    seen.add(asin);

    // TODO(extension-agent): filter to earbuds only; derive purchaseMonth + hashedOrderId
    // from the local order row without capturing the raw order id.
    evidence.push({
      retailer: "amazon",
      marketplace: "US",
      asin,
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: new Date().toISOString(),
      extensionVersion: EXTENSION_VERSION,
    });
  }
  return evidence;
}
