/**
 * Amazon page identifier extraction and host matching (minimal, privacy-preserving).
 *
 * Per docs/09 sections 3 & 7 and docs/03 (Safe behavior boundaries): extract only the
 * identifiers needed for canonical product resolution and ownership verification. Never
 * read price, rating, reviews, cart, checkout, shipping address, or payment DOM.
 */

import type { YearMonth } from "@owners/shared";
import { isValidAsin, normalizeAsin } from "@owners/shared";

/** Amazon.com product-detail path shapes we support in v0 (US marketplace only). */
const PRODUCT_PATH = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i;

/** Amazon.com order-history path shapes used for user-initiated verification. */
const ORDERS_PATH =
  /\/(?:gp\/css\/order-history|gp\/your-account\/order-history|gp\/css\/order-details|your-orders(?:\/orders)?)/i;

/** Hosts we are willing to run on at all (US marketplace only). */
const ALLOWED_HOST = /^(?:www|smile)\.amazon\.com$/i;

function hostnameOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function pathAndQueryOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return undefined;
  }
}

/** True only for the US Amazon hosts this extension is scoped to. */
export function isAllowedAmazonHost(url: string): boolean {
  const host = hostnameOf(url);
  return !!host && ALLOWED_HOST.test(host);
}

/** Extract an ASIN from a product detail URL, e.g. /dp/B0XXXXXXXX or /gp/product/B0XXXXXXXX. */
export function extractAsinFromUrl(url: string): string | undefined {
  const path = pathAndQueryOf(url) ?? url;
  const match = path.match(PRODUCT_PATH);
  const candidate = match?.[1];
  if (candidate && isValidAsin(candidate)) {
    return normalizeAsin(candidate);
  }
  return undefined;
}

/**
 * Best-effort ASIN read from the product page DOM when the URL does not carry one
 * (e.g. some canonicalized routes). Only reads stable identifier attributes.
 */
export function extractAsinFromDom(doc: Document): string | undefined {
  const idInput = doc.querySelector<HTMLInputElement>("input#ASIN, input[name='ASIN']");
  const fromInput = idInput?.value;
  if (fromInput && isValidAsin(fromInput)) return normalizeAsin(fromInput);

  const dataEl = doc.querySelector<HTMLElement>("[data-asin]");
  const fromData = dataEl?.getAttribute("data-asin") ?? undefined;
  if (fromData && isValidAsin(fromData)) return normalizeAsin(fromData);

  const canonical = doc.querySelector<HTMLLinkElement>("link[rel='canonical']");
  if (canonical?.href) {
    const fromCanonical = extractAsinFromUrl(canonical.href);
    if (fromCanonical) return fromCanonical;
  }
  return undefined;
}

/** Resolve an ASIN preferring the URL, falling back to stable DOM identifiers. */
export function extractAsin(url: string, doc?: Document): string | undefined {
  return extractAsinFromUrl(url) ?? (doc ? extractAsinFromDom(doc) : undefined);
}

/**
 * Best-effort parent/variation ASIN read from the product page.
 *
 * Sources, in order of reliability: explicit data attribute, the twister hidden input,
 * and any embedded JSON that exposes a parentAsin. We never fabricate a value.
 */
export function extractParentAsin(doc: Document): string | undefined {
  const dataEl = doc.querySelector<HTMLElement>("[data-parent-asin]");
  const fromData = dataEl?.getAttribute("data-parent-asin") ?? dataEl?.dataset.parentAsin;
  if (fromData && isValidAsin(fromData)) return normalizeAsin(fromData);

  const twister = doc.querySelector<HTMLInputElement>(
    "input#parentAsin, input[name='parentAsin'], input[name='parentASIN']",
  );
  if (twister?.value && isValidAsin(twister.value)) return normalizeAsin(twister.value);

  for (const script of Array.from(doc.querySelectorAll("script"))) {
    const text = script.textContent;
    if (!text || !text.includes("parentAsin")) continue;
    const match = text.match(/"parentAsin"\s*:\s*"([A-Z0-9]{10})"/i);
    if (match?.[1] && isValidAsin(match[1])) return normalizeAsin(match[1]);
  }
  return undefined;
}

/** True for Amazon.com product detail pages only. */
export function isProductDetailPage(url: string): boolean {
  if (!isAllowedAmazonHost(url)) return false;
  const path = pathAndQueryOf(url);
  return !!path && PRODUCT_PATH.test(path);
}

/** True for Amazon.com order-history / order-details pages only. */
export function isOrdersPage(url: string): boolean {
  if (!isAllowedAmazonHost(url)) return false;
  const path = pathAndQueryOf(url);
  return !!path && ORDERS_PATH.test(path);
}

/**
 * Heuristic earbud/in-ear audio detection from a product title snippet.
 *
 * v0 category cut-line is Amazon.com earbuds (docs/09 section 1). This is deliberately
 * conservative: it gates which order rows are treated as verification evidence so we do
 * not scan unrelated purchase categories (docs/09 section 3, extension constraints).
 */
const EARBUD_KEYWORDS = [
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
  "earpods",
];

const NON_EARBUD_KEYWORDS = ["over-ear", "over ear", "on-ear", "headphone", "headset", "speaker"];

export function looksLikeEarbuds(title: string | undefined | null): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  if (NON_EARBUD_KEYWORDS.some((k) => t.includes(k)) && !t.includes("earbud") && !t.includes("in-ear")) {
    return false;
  }
  return EARBUD_KEYWORDS.some((k) => t.includes(k));
}

const MONTHS: Record<string, string> = {
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
  dec: "12",
};

/**
 * Parse a coarse purchase month ("YYYY-MM") from Amazon order-date text such as
 * "Ordered on November 3, 2025". Only month + year are retained — the exact day is
 * intentionally discarded (docs/09 section 3: longevity signal without exact-date exposure).
 */
export function parsePurchaseMonth(text: string | undefined | null): YearMonth | undefined {
  if (!text) return undefined;
  const named = text
    .toLowerCase()
    .match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2},?\s+(\d{4})/);
  if (named) {
    const month = MONTHS[named[1]!];
    const year = named[2]!;
    if (month) return `${year}-${month}`;
  }
  const numeric = text.match(/\b(\d{4})-(\d{2})(?:-\d{2})?\b/);
  if (numeric) return `${numeric[1]}-${numeric[2]}`;
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) return `${slash[3]}-${slash[1]!.padStart(2, "0")}`;
  return undefined;
}
