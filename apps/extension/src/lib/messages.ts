/**
 * Message contracts exchanged between the content scripts, service worker, and sidebar.
 *
 * Single source of truth for runtime messaging so parallel agents can add handlers
 * without guessing payload shapes. Each message carries a discriminant `type`.
 */

import type {
  AnalyticsEventName,
  CreateQuestionRequest,
  ProductQuestionsResponse,
  ResolveProductResponse,
  SubmitOwnershipEvidenceRequest,
} from "@owners/shared";

export const EXTENSION_VERSION = "0.1.0";

/** Cached, sidebar-facing view of the currently detected product. */
export interface DetectedProductState {
  asin: string;
  parentAsin?: string;
  title?: string;
  resolved?: ResolveProductResponse;
  qa?: ProductQuestionsResponse;
}

export type ExtensionMessage =
  // content(product) -> service worker
  | { type: "PRODUCT_DETECTED"; asin: string; parentAsin?: string; title?: string }
  // content(product) -> service worker (user clicked our calm entry point)
  | { type: "OPEN_SIDEBAR" }
  // sidebar -> service worker: fetch the current detected product + Q&A
  | { type: "GET_PRODUCT_STATE" }
  // sidebar -> service worker: create a shopper question
  | { type: "ASK_QUESTION"; request: CreateQuestionRequest }
  // sidebar -> service worker: begin user-initiated Amazon Orders scan
  | { type: "START_ORDERS_SCAN" }
  // content(orders) -> service worker: minimized evidence from the scan
  | { type: "ORDERS_SCAN_RESULT"; evidence: SubmitOwnershipEvidenceRequest[] }
  // sidebar -> service worker: user confirmed submission of previewed evidence
  | { type: "SUBMIT_EVIDENCE"; evidence: SubmitOwnershipEvidenceRequest[] }
  // sidebar -> service worker: mark an answer helpful / not helpful
  | { type: "MARK_HELPFUL"; answerId: string; helpful: boolean }
  // sidebar -> service worker: report content
  | { type: "REPORT"; targetType: "question" | "answer" | "user"; targetId: string; reason: string }
  // sidebar -> service worker: disclosed "Continue to Amazon" handoff
  | { type: "COMMERCE_HANDOFF"; asin: string }
  // any surface -> service worker: analytics event
  | { type: "ANALYTICS"; name: AnalyticsEventName; props?: Record<string, string | number | boolean | null> };

export type ExtensionResponse<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Runtime type guard — used by handlers and tests to validate the message contract. */
export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (typeof value !== "object" || value === null) return false;
  const type = (value as { type?: unknown }).type;
  return (
    typeof type === "string" &&
    [
      "PRODUCT_DETECTED",
      "OPEN_SIDEBAR",
      "GET_PRODUCT_STATE",
      "ASK_QUESTION",
      "START_ORDERS_SCAN",
      "ORDERS_SCAN_RESULT",
      "SUBMIT_EVIDENCE",
      "MARK_HELPFUL",
      "REPORT",
      "COMMERCE_HANDOFF",
      "ANALYTICS",
    ].includes(type)
  );
}
