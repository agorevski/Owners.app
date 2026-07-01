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

  // ../../packages/shared/src/memory.ts
  var SEED_TS = "2026-01-01T00:00:00Z";
  var EARBUDS_SEED = {
    users: [
      {
        id: "00000000-0000-4000-8000-000000000101",
        handle: "quiet_commuter",
        roles: ["owner"],
        createdAt: SEED_TS
      },
      {
        id: "00000000-0000-4000-8000-000000000102",
        handle: "curious_shopper",
        roles: ["shopper"],
        createdAt: SEED_TS
      },
      {
        id: "00000000-0000-4000-8000-0000000001ad",
        handle: "owners_admin",
        roles: ["admin", "moderator"],
        createdAt: SEED_TS
      }
    ],
    products: [
      {
        id: "00000000-0000-4000-8000-000000000201",
        title: "Acme SoundPods Pro \u2014 Active Noise Cancelling Wireless Earbuds",
        manufacturer: "Acme Audio",
        modelNumber: "SP-PRO-2",
        provisional: false,
        createdAt: SEED_TS
      },
      {
        id: "00000000-0000-4000-8000-000000000202",
        title: "Nimbus AirBuds Lite \u2014 In-Ear Bluetooth Earbuds",
        manufacturer: "Nimbus",
        modelNumber: "AB-LITE",
        provisional: false,
        createdAt: SEED_TS
      }
    ],
    asins: [
      {
        asin: "B0EARBUD01",
        parentAsin: "B0EARBPRN1",
        canonicalProductId: "00000000-0000-4000-8000-000000000201",
        marketplace: "US"
      },
      {
        asin: "B0EARBUD02",
        parentAsin: "B0EARBPRN1",
        canonicalProductId: "00000000-0000-4000-8000-000000000201",
        marketplace: "US"
      },
      {
        asin: "B0EARBUD10",
        parentAsin: "B0EARBPRN2",
        canonicalProductId: "00000000-0000-4000-8000-000000000202",
        marketplace: "US"
      }
    ],
    ownershipClaims: [
      {
        id: "00000000-0000-4000-8000-000000000301",
        userId: "00000000-0000-4000-8000-000000000101",
        canonicalProductId: "00000000-0000-4000-8000-000000000201",
        method: "amazon_orders_user_initiated_scan",
        status: "verified",
        confidence: 0.9,
        asin: "B0EARBUD01",
        parentAsin: "B0EARBPRN1",
        purchaseMonth: "2025-11",
        hashedOrderId: "sha256:" + "a".repeat(64),
        verifiedAt: SEED_TS,
        createdAt: SEED_TS
      }
    ],
    questions: [
      {
        id: "00000000-0000-4000-8000-000000000401",
        canonicalProductId: "00000000-0000-4000-8000-000000000201",
        authorId: "00000000-0000-4000-8000-000000000102",
        body: "How is the noise cancelling on a noisy train commute?",
        status: "open",
        createdAt: SEED_TS
      }
    ]
  };

  // src/lib/amazon.ts
  var PRODUCT_PATH = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;
  var ALLOWED_HOST = /^(?:www|smile)\.amazon\.com$/i;
  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return void 0;
    }
  }
  function pathAndQueryOf(url) {
    try {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    } catch {
      return void 0;
    }
  }
  function isAllowedAmazonHost(url) {
    const host = hostnameOf(url);
    return !!host && ALLOWED_HOST.test(host);
  }
  function extractAsinFromUrl(url) {
    const path = pathAndQueryOf(url) ?? url;
    const match = path.match(PRODUCT_PATH);
    const candidate = match?.[1];
    if (candidate && isValidAsin(candidate)) {
      return normalizeAsin(candidate);
    }
    return void 0;
  }
  function extractAsinFromDom(doc) {
    const idInput = doc.querySelector("input#ASIN, input[name='ASIN']");
    const fromInput = idInput?.value;
    if (fromInput && isValidAsin(fromInput)) return normalizeAsin(fromInput);
    const dataEl = doc.querySelector("[data-asin]");
    const fromData = dataEl?.getAttribute("data-asin") ?? void 0;
    if (fromData && isValidAsin(fromData)) return normalizeAsin(fromData);
    const canonical = doc.querySelector("link[rel='canonical']");
    if (canonical?.href) {
      const fromCanonical = extractAsinFromUrl(canonical.href);
      if (fromCanonical) return fromCanonical;
    }
    return void 0;
  }
  function extractAsin(url, doc) {
    return extractAsinFromUrl(url) ?? (doc ? extractAsinFromDom(doc) : void 0);
  }
  function extractParentAsin(doc) {
    const dataEl = doc.querySelector("[data-parent-asin]");
    const fromData = dataEl?.getAttribute("data-parent-asin") ?? dataEl?.dataset.parentAsin;
    if (fromData && isValidAsin(fromData)) return normalizeAsin(fromData);
    const twister = doc.querySelector(
      "input#parentAsin, input[name='parentAsin'], input[name='parentASIN']"
    );
    if (twister?.value && isValidAsin(twister.value)) return normalizeAsin(twister.value);
    for (const script of Array.from(doc.querySelectorAll("script"))) {
      const text = script.textContent;
      if (!text || !text.includes("parentAsin")) continue;
      const match = text.match(/"parentAsin"\s*:\s*"([A-Z0-9]{10})"/i);
      if (match?.[1] && isValidAsin(match[1])) return normalizeAsin(match[1]);
    }
    return void 0;
  }
  function isProductDetailPage(url) {
    if (!isAllowedAmazonHost(url)) return false;
    const path = pathAndQueryOf(url);
    return !!path && PRODUCT_PATH.test(path);
  }

  // src/content/product.ts
  var FORBIDDEN_HOST_SELECTORS = [
    "#add-to-cart-button",
    "#buy-now-button",
    "#priceblock_ourprice",
    "#priceblock_dealprice",
    ".a-price",
    "#acrCustomerReviewText",
    "#averageCustomerReviews",
    "#nav-cart",
    "form[action*='checkout']",
    "#checkout"
  ];
  var BADGE_CONTAINER_ID = "owners-app-entry-point";
  function buildProductDetection(url, doc) {
    if (!isProductDetailPage(url)) return void 0;
    const asin = extractAsin(url, doc);
    if (!asin) return void 0;
    return {
      message: {
        type: "PRODUCT_DETECTED",
        asin,
        parentAsin: extractParentAsin(doc),
        title: doc.title || void 0
      }
    };
  }
  function renderCalmEntryPoint(doc, opts) {
    const existing = doc.getElementById(BADGE_CONTAINER_ID);
    if (existing) return existing;
    const container = doc.createElement("div");
    container.id = BADGE_CONTAINER_ID;
    container.setAttribute("role", "complementary");
    container.setAttribute("aria-label", "Owners.app");
    container.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:system-ui,sans-serif;";
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = opts.label ?? "Ask a verified owner";
    button.style.cssText = "padding:10px 14px;border:1px solid #111;border-radius:999px;background:#111;color:#fff;cursor:pointer;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.15);";
    button.addEventListener("click", (e) => {
      e.preventDefault();
      opts.onOpen();
    });
    container.appendChild(button);
    doc.body.appendChild(container);
    return container;
  }
  function init() {
    const detection = buildProductDetection(window.location.href, document);
    if (!detection) return;
    chrome.runtime.sendMessage(detection.message).catch(() => {
    });
    renderCalmEntryPoint(document, {
      onOpen: () => {
        const open = { type: "OPEN_SIDEBAR" };
        chrome.runtime.sendMessage(open).catch(() => {
        });
      }
    });
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    init();
  }
})();
//# sourceMappingURL=product.js.map
