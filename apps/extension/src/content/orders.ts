/**
 * Amazon Orders verification scanner (injected on explicit user action only).
 *
 * NOT declared in manifest content_scripts. The service worker injects it via
 * chrome.scripting.executeScript after the owner starts verification and confirms the
 * evidence explanation (docs/09 section 3: user-initiated, scoped, minimal).
 *
 * It reads ONLY visible order rows to identify earbud ownership, filters locally to the
 * earbuds category, and returns a minimized normalized evidence payload. It MUST NOT read
 * credentials, payment, shipping address, price, or the raw/full order id (only a one-way
 * hash of the order id is retained).
 */

import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";
import { extractAsinFromUrl, looksLikeEarbuds, parsePurchaseMonth } from "../lib/amazon";
import { extractOrderId, hashOrderId } from "../lib/hash";
import { EXTENSION_VERSION } from "../lib/messages";

/** Fields captured transiently per candidate row before minimization/hashing. */
interface RawOrderRow {
  asin: string;
  title: string;
  purchaseText?: string;
  orderIdText?: string;
}

/** Selectors used to locate order cards / rows. Kept resilient to minor markup changes. */
const ORDER_CARD_SELECTORS = [
  ".order-card",
  ".order",
  ".a-box-group.order",
  "[data-order-card]",
  ".js-order-card",
];

function closestOrderCard(el: Element): Element {
  for (const sel of ORDER_CARD_SELECTORS) {
    const card = el.closest(sel);
    if (card) return card;
  }
  return el.ownerDocument?.body ?? el;
}

/**
 * Extract raw candidate rows (earbuds only) from the Orders DOM. This reads the product
 * title text, the /dp/ link, the order date header, and the order-id text. It deliberately
 * ignores any price, address, or payment nodes.
 */
export function extractEarbudOrderRows(doc: Document): RawOrderRow[] {
  const rows: RawOrderRow[] = [];
  const seen = new Set<string>();

  const links = doc.querySelectorAll<HTMLAnchorElement>(
    "a[href*='/dp/'], a[href*='/gp/product/']",
  );

  for (const link of Array.from(links)) {
    const asin = extractAsinFromUrl(link.href);
    if (!asin) continue;
    const title = (link.textContent ?? "").trim();
    if (!looksLikeEarbuds(title)) continue;

    const card = closestOrderCard(link);
    // Order-date + order-id text live in the card header; read text only, no price nodes.
    const headerText = card.textContent ?? "";
    const key = `${asin}`;
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      asin,
      title,
      purchaseText: headerText,
      orderIdText: headerText,
    });
  }
  return rows;
}

/**
 * Scan the Orders page and return minimized ownership evidence for earbud purchases only.
 * The raw order id is used only to compute a one-way hash and is never included in output.
 */
export async function scanOrdersPage(
  doc: Document = document,
): Promise<SubmitOwnershipEvidenceRequest[]> {
  const rows = extractEarbudOrderRows(doc);
  const capturedAt = new Date().toISOString();

  const evidence = await Promise.all(
    rows.map(async (row): Promise<SubmitOwnershipEvidenceRequest> => {
      const rawOrderId = extractOrderId(row.orderIdText);
      const hashedOrderId = rawOrderId ? await hashOrderId(rawOrderId) : undefined;
      return {
        retailer: "amazon",
        marketplace: "US",
        asin: row.asin,
        purchaseMonth: parsePurchaseMonth(row.purchaseText),
        hashedOrderId,
        verificationMethod: "amazon_orders_user_initiated_scan",
        capturedAt,
        extensionVersion: EXTENSION_VERSION,
      };
    }),
  );
  return evidence;
}

// When injected by chrome.scripting.executeScript, run the scan and post the result back.
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  void scanOrdersPage(document).then((evidence) => {
    chrome.runtime.sendMessage({ type: "ORDERS_SCAN_RESULT", evidence }).catch(() => {});
  });
}
