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

/** Type guard: whether a raw string is a known v0 analytics event name. */
export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(value);
}

/** Construct a well-typed analytics event, defaulting `occurredAt` to now. */
export function createAnalyticsEvent(
  name: AnalyticsEventName,
  options: { principalId?: string; props?: AnalyticsEventProps; occurredAt?: string } = {},
): AnalyticsEvent {
  return {
    name,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    ...(options.principalId !== undefined ? { principalId: options.principalId } : {}),
    ...(options.props !== undefined ? { props: options.props } : {}),
  };
}
