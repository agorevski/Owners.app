/**
 * Point-of-consumption disclosure & provenance copy for the web prototype.
 *
 * Mirrors the extension copy (apps/extension/src/lib/disclosures.ts) so the web and extension
 * surfaces present consistent, non-buried disclosures (docs/01 Flow S5, docs/03 UX safety).
 */

export const DISCLOSURE_COPY_VERSION = "v0-2026-06";

export const HANDOFF_DISCLOSURE =
  "No affiliate tag in this v0. This opens the normal Amazon product page in a new tab. " +
  "Owners.app earns nothing from this click.";

export const V0_PROVENANCE_NOTE =
  "Owners.app v0: answers come from verified owners only. AI answer generation is off in this build.";

export const PRIVACY_NOTE =
  "We show a pseudonymous handle and a verified-owner badge — never your real name, email, " +
  "Amazon order id, price, or address.";

export const VERIFICATION_CONSENT_BODY =
  "Verification is user-initiated and credential-free. In the real extension you open your Amazon " +
  "Orders page and click Scan; Owners.app reads only visible earbud order rows and stores the " +
  "product (ASIN), the purchase month, and a one-way hashed order id. We never read or store your " +
  "Amazon password, full order id, price, shipping address, or payment method. You can review the " +
  "evidence and cancel before anything is submitted, and delete a claim afterward.";

export const RECOGNITION_NOTE =
  "Recognition only in v0: verified badge, helpfulness, and top-helper status. No cash earnings, " +
  "payouts, or affiliate-funded rewards. Any future payout program will be clearly disclosed first.";
