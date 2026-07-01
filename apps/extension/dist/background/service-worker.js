"use strict";
(() => {
  // src/background/service-worker.ts
  var API_BASE = "http://localhost:5173/api";
  var lastResolved;
  async function resolveProduct(req) {
    try {
      const res = await fetch(`${API_BASE}/products/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req)
      });
      if (!res.ok) return void 0;
      return await res.json();
    } catch {
      return void 0;
    }
  }
  chrome.runtime.onMessage.addListener(
    (message, _sender, sendResponse) => {
      if (message.type === "PRODUCT_DETECTED") {
        void resolveProduct({
          asin: message.asin,
          parentAsin: message.parentAsin,
          title: message.title
        }).then((resolved) => {
          lastResolved = resolved;
          sendResponse({ ok: true });
        });
        return true;
      }
      if (message.type === "START_ORDERS_SCAN") {
        sendResponse({ ok: true });
        return false;
      }
      return false;
    }
  );
})();
//# sourceMappingURL=service-worker.js.map
