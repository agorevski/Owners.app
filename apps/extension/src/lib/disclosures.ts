/**
 * Point-of-consumption disclosure copy (docs/01 Flow S5, docs/03 UX safety & disclosure).
 *
 * These strings are shown inline at the moment of interaction, never buried in a policy
 * page. Versioned so the handoff analytics event can log which disclosure copy was shown.
 */

export const DISCLOSURE_COPY_VERSION = "v0-2026-06";

export const HANDOFF_DISCLOSURE =
  "No affiliate tag in this v0. This opens the normal Amazon product page in a new tab.";

export const VERIFICATION_CONSENT_TITLE = "Verify earbuds you own";

export const VERIFICATION_CONSENT_BODY =
  "Open your Amazon Orders page, then start the scan. Owners.app reads only visible earbud " +
  "order rows to confirm ownership. We capture the product (ASIN), the purchase month, and a " +
  "one-way hashed order id. We never read or store your Amazon password, full order id, price, " +
  "shipping address, or payment method. You can review the evidence and cancel before anything " +
  "is submitted.";

export const V0_PROVENANCE_NOTE =
  "Owners.app v0: answers come from verified owners only. AI answer generation is off in this build.";
