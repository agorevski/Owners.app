/**
 * Message contracts exchanged between the content scripts, service worker, and sidebar.
 *
 * Keep this the single source of truth for runtime messaging so parallel agents can add
 * handlers without guessing payload shapes.
 */

import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";

export type ExtensionMessage =
  | { type: "PRODUCT_DETECTED"; asin: string; parentAsin?: string; title?: string }
  | { type: "OPEN_SIDEBAR" }
  | { type: "START_ORDERS_SCAN" }
  | { type: "ORDERS_SCAN_RESULT"; evidence: SubmitOwnershipEvidenceRequest[] };

export type ExtensionResponse = { ok: true } | { ok: false; error: string };

export const EXTENSION_VERSION = "0.1.0";
