import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENT_NAMES,
  createAnalyticsEvent,
  isAnalyticsEventName,
} from "./events";
import type { AnalyticsEventName } from "./events";

describe("analytics event taxonomy", () => {
  it("covers the full funnel from docs/09 §11", () => {
    // ask -> verify -> answer -> helpfulness -> handoff
    expect(ANALYTICS_EVENT_NAMES).toContain("question_submitted");
    expect(ANALYTICS_EVENT_NAMES).toContain("ownership_claim_approved");
    expect(ANALYTICS_EVENT_NAMES).toContain("answer_submitted");
    expect(ANALYTICS_EVENT_NAMES).toContain("answer_marked_helpful");
    expect(ANALYTICS_EVENT_NAMES).toContain("commerce_handoff_clicked");
    expect(ANALYTICS_EVENT_NAMES).toHaveLength(13);
  });

  it("narrows unknown strings via the type guard", () => {
    const raw = "sidebar_opened";
    expect(isAnalyticsEventName(raw)).toBe(true);
    if (isAnalyticsEventName(raw)) {
      const name: AnalyticsEventName = raw; // compiles only because guard narrows
      expect(name).toBe("sidebar_opened");
    }
    expect(isAnalyticsEventName("not_a_real_event")).toBe(false);
  });

  it("builds well-typed events with defaults", () => {
    const event = createAnalyticsEvent("commerce_handoff_clicked", {
      principalId: "user-1",
      props: { asin: "B0EARBUD01", position: 1 },
    });
    expect(event.name).toBe("commerce_handoff_clicked");
    expect(event.principalId).toBe("user-1");
    expect(event.props?.asin).toBe("B0EARBUD01");
    expect(typeof event.occurredAt).toBe("string");
  });

  it("omits principalId for pre-auth events", () => {
    const event = createAnalyticsEvent("extension_installed");
    expect(event.principalId).toBeUndefined();
  });
});
