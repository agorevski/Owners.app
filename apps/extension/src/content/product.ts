/**
 * Product-page content script.
 *
 * Responsibilities (v0):
 *  - Detect Amazon.com product detail pages.
 *  - Extract ASIN + parent/variation ASIN only.
 *  - Notify the service worker so it can resolve the canonical product and surface a calm
 *    badge/entry point.
 *
 * Must NOT alter Amazon price, rating, review, cart, checkout, or buy-box UI, and must not
 * reload the page. See docs/09 section 7.
 *
 * TODO(extension-agent): render the calm badge + "Ask a verified owner" entry point and
 * open the sidebar on user click.
 */

import { extractAsinFromUrl, extractParentAsin, isProductDetailPage } from "../lib/amazon";
import type { ExtensionMessage } from "../lib/messages";

function init(): void {
  const url = window.location.href;
  if (!isProductDetailPage(url)) return;

  const asin = extractAsinFromUrl(url);
  if (!asin) return;

  const message: ExtensionMessage = {
    type: "PRODUCT_DETECTED",
    asin,
    parentAsin: extractParentAsin(document),
    title: document.title,
  };
  chrome.runtime.sendMessage(message).catch(() => {
    /* Service worker may be asleep; resolution retries on next interaction. */
  });
}

init();
