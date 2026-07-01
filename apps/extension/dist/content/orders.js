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
  function pathAndQueryOf(url) {
    try {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    } catch {
      return void 0;
    }
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
  var EARBUD_KEYWORDS = [
    "earbud",
    "earbuds",
    "ear buds",
    "in-ear",
    "in ear",
    "earphone",
    "earphones",
    "wireless earbuds",
    "true wireless",
    "tws",
    "airpods",
    "galaxy buds",
    "earpods"
  ];
  var NON_EARBUD_KEYWORDS = ["over-ear", "over ear", "on-ear", "headphone", "headset", "speaker"];
  function looksLikeEarbuds(title) {
    if (!title) return false;
    const t = title.toLowerCase();
    if (NON_EARBUD_KEYWORDS.some((k) => t.includes(k)) && !t.includes("earbud") && !t.includes("in-ear")) {
      return false;
    }
    return EARBUD_KEYWORDS.some((k) => t.includes(k));
  }
  var MONTHS = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    sept: "09",
    oct: "10",
    nov: "11",
    dec: "12"
  };
  function parsePurchaseMonth(text) {
    if (!text) return void 0;
    const named = text.toLowerCase().match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(\d{4})/);
    if (named) {
      const month = MONTHS[named[1]];
      const year = named[2];
      if (month) return `${year}-${month}`;
    }
    const numeric = text.match(/\b(\d{4})-(\d{2})(?:-\d{2})?\b/);
    if (numeric) return `${numeric[1]}-${numeric[2]}`;
    const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (slash) return `${slash[3]}-${slash[1].padStart(2, "0")}`;
    return void 0;
  }

  // src/lib/hash.ts
  var PREFIX = "sha256:";
  function extractOrderId(text) {
    if (!text) return void 0;
    const match = text.match(/\b\d{3}-\d{7}-\d{7}\b/);
    return match?.[0];
  }
  async function hashOrderId(rawOrderId) {
    const bytes = new TextEncoder().encode(rawOrderId.trim());
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${PREFIX}${hex}`;
  }

  // src/lib/messages.ts
  var EXTENSION_VERSION = "0.1.0";

  // src/content/orders.ts
  var ORDER_CARD_SELECTORS = [
    ".order-card",
    ".order",
    ".a-box-group.order",
    "[data-order-card]",
    ".js-order-card"
  ];
  function closestOrderCard(el) {
    for (const sel of ORDER_CARD_SELECTORS) {
      const card = el.closest(sel);
      if (card) return card;
    }
    return el.ownerDocument?.body ?? el;
  }
  function extractEarbudOrderRows(doc) {
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    const links = doc.querySelectorAll(
      "a[href*='/dp/'], a[href*='/gp/product/']"
    );
    for (const link of Array.from(links)) {
      const asin = extractAsinFromUrl(link.href);
      if (!asin) continue;
      const title = (link.textContent ?? "").trim();
      if (!looksLikeEarbuds(title)) continue;
      const card = closestOrderCard(link);
      const headerText = card.textContent ?? "";
      const key = `${asin}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        asin,
        title,
        purchaseText: headerText,
        orderIdText: headerText
      });
    }
    return rows;
  }
  async function scanOrdersPage(doc = document) {
    const rows = extractEarbudOrderRows(doc);
    const capturedAt = (/* @__PURE__ */ new Date()).toISOString();
    const evidence = await Promise.all(
      rows.map(async (row) => {
        const rawOrderId = extractOrderId(row.orderIdText);
        const hashedOrderId = rawOrderId ? await hashOrderId(rawOrderId) : void 0;
        return {
          retailer: "amazon",
          marketplace: "US",
          asin: row.asin,
          purchaseMonth: parsePurchaseMonth(row.purchaseText),
          hashedOrderId,
          verificationMethod: "amazon_orders_user_initiated_scan",
          capturedAt,
          extensionVersion: EXTENSION_VERSION
        };
      })
    );
    return evidence;
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.id) {
    void scanOrdersPage(document).then((evidence) => {
      chrome.runtime.sendMessage({ type: "ORDERS_SCAN_RESULT", evidence }).catch(() => {
      });
    });
  }
})();
//# sourceMappingURL=orders.js.map
