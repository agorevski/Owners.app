import { describe, expect, it } from "vitest";
import { EXTENSION_VERSION, isExtensionMessage, type ExtensionMessage } from "./messages";

describe("extension message contracts", () => {
  it("validates every known message type", () => {
    const messages: ExtensionMessage[] = [
      { type: "PRODUCT_DETECTED", asin: "B0EXAMPLE1", parentAsin: "B0PARENT01", title: "Earbuds" },
      { type: "OPEN_SIDEBAR" },
      { type: "GET_PRODUCT_STATE" },
      { type: "ASK_QUESTION", request: { canonicalProductId: "p1", body: "hi" } },
      { type: "START_ORDERS_SCAN" },
      { type: "ORDERS_SCAN_RESULT", evidence: [] },
      { type: "SUBMIT_EVIDENCE", evidence: [] },
      { type: "MARK_HELPFUL", answerId: "a1", helpful: true },
      { type: "REPORT", targetType: "answer", targetId: "a1", reason: "spam" },
      { type: "COMMERCE_HANDOFF", asin: "B0EXAMPLE1" },
      { type: "ANALYTICS", name: "sidebar_opened" },
    ];
    for (const m of messages) expect(isExtensionMessage(m)).toBe(true);
  });

  it("rejects malformed or unknown messages", () => {
    expect(isExtensionMessage(null)).toBe(false);
    expect(isExtensionMessage({})).toBe(false);
    expect(isExtensionMessage({ type: "NOPE" })).toBe(false);
    expect(isExtensionMessage("PRODUCT_DETECTED")).toBe(false);
  });

  it("pins the extension version used in evidence payloads", () => {
    expect(EXTENSION_VERSION).toBe("0.1.0");
  });
});
