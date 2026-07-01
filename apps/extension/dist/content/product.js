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
  function extractParentAsin(doc) {
    const el = doc.querySelector("[data-parent-asin]");
    const value = el?.dataset.parentAsin;
    if (value && isValidAsin(value)) {
      return normalizeAsin(value);
    }
    return void 0;
  }
  function isProductDetailPage(url) {
    return /:\/\/(www|smile)\.amazon\.com\/.*\/(dp|gp\/product|gp\/aw\/d)\//i.test(url) || /:\/\/(www|smile)\.amazon\.com\/(dp|gp\/product|gp\/aw\/d)\//i.test(url);
  }

  // src/content/product.ts
  function init() {
    const url = window.location.href;
    if (!isProductDetailPage(url)) return;
    const asin = extractAsinFromUrl(url);
    if (!asin) return;
    const message = {
      type: "PRODUCT_DETECTED",
      asin,
      parentAsin: extractParentAsin(document),
      title: document.title
    };
    chrome.runtime.sendMessage(message).catch(() => {
    });
  }
  init();
})();
//# sourceMappingURL=product.js.map
