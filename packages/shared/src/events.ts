/**
 * Analytics event taxonomy for the v0 ask -> verify -> answer -> helpfulness -> handoff funnel.
 *
 * See docs/09-mvp-implementation-spec.md section 11 — Analytics events.
 */

export type AnalyticsEventName =
  | "extension_installed"
  | "amazon_product_detected"
  | "sidebar_opened"
  | "question_started"
  | "question_submitted"
  | "owner_verification_started"
  | "amazon_orders_scan_started"
  | "ownership_claim_submitted"
  | "ownership_claim_approved"
  | "answer_submitted"
  | "answer_marked_helpful"
  | "content_reported"
  | "commerce_handoff_clicked";

/** Loosely-typed properties bag; individual events may refine this later. */
export type AnalyticsEventProps = Record<string, string | number | boolean | null>;

export interface AnalyticsEvent {
  name: AnalyticsEventName;
  /** Anonymous or authenticated principal id; omitted for pre-auth events. */
  principalId?: string;
  props?: AnalyticsEventProps;
  occurredAt: string;
}

export const ANALYTICS_EVENT_NAMES: readonly AnalyticsEventName[] = [
  "extension_installed",
  "amazon_product_detected",
  "sidebar_opened",
  "question_started",
  "question_submitted",
  "owner_verification_started",
  "amazon_orders_scan_started",
  "ownership_claim_submitted",
  "ownership_claim_approved",
  "answer_submitted",
  "answer_marked_helpful",
  "content_reported",
  "commerce_handoff_clicked",
] as const;
