/**
 * Product-page content script (docs/09 section 7, docs/03 Safe behavior boundaries).
 *
 * Responsibilities (v0):
 *  - Detect Amazon.com product detail pages and extract ASIN + parent/variation ASIN only.
 *  - Notify the service worker so it can resolve the canonical product.
 *  - Render a single calm entry point ("Ask a verified owner") that opens the sidebar on click.
 *
 * HARD RULES enforced here:
 *  - Never read or mutate Amazon price, rating, review, cart, checkout, or buy-box DOM.
 *  - Never reload the page (no affiliate attribution / no navigation side effects).
 *  - Only append our own isolated container; never modify host nodes.
 */

import { extractAsin, extractParentAsin, isProductDetailPage } from "../lib/amazon";
import type { ExtensionMessage } from "../lib/messages";

/** Host DOM ids/selectors the extension must never touch (read or write). */
export const FORBIDDEN_HOST_SELECTORS = [
  "#add-to-cart-button",
  "#buy-now-button",
  "#priceblock_ourprice",
  "#priceblock_dealprice",
  ".a-price",
  "#acrCustomerReviewText",
  "#averageCustomerReviews",
  "#nav-cart",
  "form[action*='checkout']",
  "#checkout",
];

export const BADGE_CONTAINER_ID = "owners-app-entry-point";

export interface ProductDetection {
  message: Extract<ExtensionMessage, { type: "PRODUCT_DETECTED" }>;
}

/** Pure detection: returns the PRODUCT_DETECTED message for a page, or undefined. */
export function buildProductDetection(url: string, doc: Document): ProductDetection | undefined {
  if (!isProductDetailPage(url)) return undefined;
  const asin = extractAsin(url, doc);
  if (!asin) return undefined;
  return {
    message: {
      type: "PRODUCT_DETECTED",
      asin,
      parentAsin: extractParentAsin(doc),
      title: doc.title || undefined,
    },
  };
}

/**
 * Render the calm entry point. Appends ONLY an isolated container to <body>; it never
 * modifies, reorders, or reads value from host price/cart/checkout/review nodes.
 * Returns the created element (or the existing one) for testing and idempotency.
 */
export function renderCalmEntryPoint(
  doc: Document,
  opts: { label?: string; onOpen: () => void },
): HTMLElement {
  const existing = doc.getElementById(BADGE_CONTAINER_ID);
  if (existing) return existing;

  const container = doc.createElement("div");
  container.id = BADGE_CONTAINER_ID;
  container.setAttribute("role", "complementary");
  container.setAttribute("aria-label", "Owners.app");
  // Fixed-position, isolated chrome — never overlaps host CTAs or reflows host content.
  container.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,sans-serif;";

  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = opts.label ?? "Ask a verified owner";
  button.style.cssText =
    "padding:10px 14px;border:1px solid #111;border-radius:999px;background:#111;color:#fff;cursor:pointer;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.15);";
  button.addEventListener("click", (e) => {
    e.preventDefault();
    opts.onOpen();
  });

  container.appendChild(button);
  doc.body.appendChild(container);
  return container;
}

function init(): void {
  const detection = buildProductDetection(window.location.href, document);
  if (!detection) return;

  chrome.runtime.sendMessage(detection.message).catch(() => {
    /* Service worker may be asleep; resolution retries on next interaction. */
  });

  renderCalmEntryPoint(document, {
    onOpen: () => {
      const open: ExtensionMessage = { type: "OPEN_SIDEBAR" };
      chrome.runtime.sendMessage(open).catch(() => {});
    },
  });
}

// Guard so the module can be imported in tests without executing against a real page.
if (typeof chrome !== "undefined" && chrome.runtime?.id) {
  init();
}
