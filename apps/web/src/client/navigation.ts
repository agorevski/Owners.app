/**
 * URL entry parsing for the shopper deep-link flow.
 *
 * The Chrome extension (and share-sheet / notification deep links — docs/03 Mobile) can hand
 * a shopper into the web app pointed straight at a product. We accept extension-compatible
 * query params or hash route state so the same resolve -> Q&A flow works without the extension.
 *
 * Supported forms:
 *   ?productId=<canonicalProductId>          -> open that product's Q&A page
 *   ?asin=B0..&parentAsin=B0..               -> resolve the ASIN, then open its Q&A page
 *   ?view=owner-verify | owner-dashboard | admin | home
 *   #/products/<canonicalProductId>          -> hash route state form
 *
 * This module is pure and framework-free so it is easy to unit test.
 */

export type ViewKey = "home" | "product" | "ownerVerify" | "ownerDashboard" | "admin";

export interface NavParams {
  productId?: string;
  asin?: string;
  parentAsin?: string;
  questionId?: string;
}

export interface NavState {
  view: ViewKey;
  params: NavParams;
}

const VIEW_ALIASES: Record<string, ViewKey> = {
  home: "home",
  product: "product",
  "owner-verify": "ownerVerify",
  ownerverify: "ownerVerify",
  verify: "ownerVerify",
  "owner-dashboard": "ownerDashboard",
  ownerdashboard: "ownerDashboard",
  dashboard: "ownerDashboard",
  admin: "admin",
};

/** Parse `location.search` + `location.hash` into an initial navigation state. */
export function parseEntry(search: string, hash = ""): NavState {
  const params: NavParams = {};

  // Hash route form: #/products/<id>
  const hashMatch = hash.replace(/^#/, "").match(/^\/products\/([^/?#]+)/);
  if (hashMatch) {
    params.productId = decodeURIComponent(hashMatch[1]!);
    return { view: "product", params };
  }

  const qs = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  const asin = qs.get("asin") ?? undefined;
  const parentAsin = qs.get("parentAsin") ?? undefined;
  const productId = qs.get("productId") ?? undefined;
  const questionId = qs.get("questionId") ?? undefined;
  if (asin) params.asin = asin;
  if (parentAsin) params.parentAsin = parentAsin;
  if (productId) params.productId = productId;
  if (questionId) params.questionId = questionId;

  if (productId || asin) {
    return { view: "product", params };
  }

  const viewParam = qs.get("view");
  if (viewParam) {
    const view = VIEW_ALIASES[viewParam.toLowerCase()];
    if (view) return { view, params };
  }

  return { view: "home", params };
}
