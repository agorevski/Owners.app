/**
 * MV3 service worker (background).
 *
 * Responsibilities (v0):
 *  - Receive PRODUCT_DETECTED from the product content script and resolve the canonical
 *    product via the Owners.app API.
 *  - Cache the last-resolved product for the sidebar.
 *  - Orchestrate the user-initiated Amazon Orders scan by injecting content/orders.js.
 *
 * TODO(extension-agent): wire real API base URL + auth session, and persist cache in
 * chrome.storage. The API client below is a thin placeholder.
 */

import type { ResolveProductRequest, ResolveProductResponse } from "@owners/shared";
import type { ExtensionMessage, ExtensionResponse } from "../lib/messages";

const API_BASE = "http://localhost:5173/api"; // TODO(extension-agent): configurable.

let lastResolved: ResolveProductResponse | undefined;

async function resolveProduct(req: ResolveProductRequest): Promise<ResolveProductResponse | undefined> {
  try {
    const res = await fetch(`${API_BASE}/products/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
    });
    if (!res.ok) return undefined;
    return (await res.json()) as ResolveProductResponse;
  } catch {
    return undefined;
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse: (r: ExtensionResponse) => void) => {
    if (message.type === "PRODUCT_DETECTED") {
      void resolveProduct({
        asin: message.asin,
        parentAsin: message.parentAsin,
        title: message.title,
      }).then((resolved) => {
        lastResolved = resolved;
        sendResponse({ ok: true });
      });
      return true; // async response
    }

    if (message.type === "START_ORDERS_SCAN") {
      // TODO(extension-agent): after consent, inject content/orders.js into the active
      // Orders tab via chrome.scripting.executeScript and forward evidence to the API.
      sendResponse({ ok: true });
      return false;
    }

    return false;
  },
);

export { lastResolved };
