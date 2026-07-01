"use strict";
(() => {
  // ../../packages/shared/src/product.ts
  var ASIN_PATTERN = /^[A-Z0-9]{10}$/;
  function isValidAsin(value) {
    return ASIN_PATTERN.test(value.trim().toUpperCase());
  }
  function normalizeAsin(value) {
    return value.trim().toUpperCase();
  }

  // src/lib/amazon.ts
  function extractAsinFromUrl(url) {
    const match = url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/i);
    const candidate = match?.[1];
    if (candidate && isValidAsin(candidate)) {
      return normalizeAsin(candidate);
    }
    return void 0;
  }

  // src/lib/messages.ts
  var EXTENSION_VERSION = "0.1.0";

  // src/content/orders.ts
  function scanOrdersPage(doc = document) {
    const evidence = [];
    const links = doc.querySelectorAll("a[href*='/dp/'], a[href*='/gp/product/']");
    const seen = /* @__PURE__ */ new Set();
    for (const link of links) {
      const asin = extractAsinFromUrl(link.href);
      if (!asin || seen.has(asin)) continue;
      seen.add(asin);
      evidence.push({
        retailer: "amazon",
        marketplace: "US",
        asin,
        verificationMethod: "amazon_orders_user_initiated_scan",
        capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
        extensionVersion: EXTENSION_VERSION
      });
    }
    return evidence;
  }
})();
//# sourceMappingURL=orders.js.map
