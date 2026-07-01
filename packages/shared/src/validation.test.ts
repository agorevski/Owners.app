import { describe, expect, it } from "vitest";
import type { MinimalOwnershipEvidence } from "./types";
import {
  isSupportedMarketplace,
  isSupportedRetailer,
  isValidHandle,
  isValidHashedOrderId,
  isValidParentAsin,
  isValidYearMonth,
  normalizeHandle,
  normalizeHashedOrderId,
  validateOwnershipEvidence,
} from "./validation";

const NOW = new Date("2026-06-30T00:00:00Z");

function validEvidence(overrides: Partial<MinimalOwnershipEvidence> = {}): MinimalOwnershipEvidence {
  return {
    retailer: "amazon",
    marketplace: "US",
    asin: "B0EARBUD01",
    parentAsin: "B0EARBPRN1",
    purchaseMonth: "2025-11",
    hashedOrderId: "sha256:" + "a".repeat(64),
    verificationMethod: "amazon_orders_user_initiated_scan",
    capturedAt: "2026-06-30T00:00:00Z",
    extensionVersion: "0.1.0",
    ...overrides,
  };
}

describe("marketplace / retailer guards", () => {
  it("accepts only US and amazon", () => {
    expect(isSupportedMarketplace("US")).toBe(true);
    expect(isSupportedMarketplace("UK")).toBe(false);
    expect(isSupportedRetailer("amazon")).toBe(true);
    expect(isSupportedRetailer("walmart")).toBe(false);
  });
});

describe("parent ASIN validation", () => {
  it("uses the same rules as a child ASIN", () => {
    expect(isValidParentAsin("B0EARBPRN1")).toBe(true);
    expect(isValidParentAsin("nope")).toBe(false);
  });
});

describe("purchase month (YYYY-MM)", () => {
  it("accepts well-formed, non-future months", () => {
    expect(isValidYearMonth("2025-11", NOW)).toBe(true);
    expect(isValidYearMonth("2026-06", NOW)).toBe(true);
  });
  it("rejects malformed, future, or implausible months", () => {
    expect(isValidYearMonth("2025-13", NOW)).toBe(false);
    expect(isValidYearMonth("2025/11", NOW)).toBe(false);
    expect(isValidYearMonth("2026-07", NOW)).toBe(false); // future
    expect(isValidYearMonth("1990-01", NOW)).toBe(false); // pre-Amazon
  });
});

describe("hashed order id", () => {
  it("requires sha256:<64 hex> and never a raw order id", () => {
    expect(isValidHashedOrderId("sha256:" + "a".repeat(64))).toBe(true);
    expect(isValidHashedOrderId("SHA256:" + "A".repeat(64))).toBe(true); // normalized to lowercase
    expect(isValidHashedOrderId("111-2223334-5556667")).toBe(false); // raw Amazon order id
    expect(isValidHashedOrderId("sha256:tooshort")).toBe(false);
  });
  it("normalizes to lowercase", () => {
    expect(normalizeHashedOrderId("  SHA256:" + "A".repeat(64) + " ")).toBe(
      "sha256:" + "a".repeat(64),
    );
  });
});

describe("pseudonymous handle", () => {
  it("accepts lowercase alphanumeric + underscore starting with a letter", () => {
    expect(isValidHandle("quiet_commuter")).toBe(true);
    expect(isValidHandle("Quiet_Commuter")).toBe(true); // normalized
  });
  it("rejects too-short, digit-leading, or symbol handles", () => {
    expect(isValidHandle("ab")).toBe(false);
    expect(isValidHandle("1owner")).toBe(false);
    expect(isValidHandle("owner!")).toBe(false);
  });
  it("normalizes to trimmed lowercase", () => {
    expect(normalizeHandle("  QuietCommuter ")).toBe("quietcommuter");
  });
});

describe("validateOwnershipEvidence", () => {
  it("accepts and normalizes a complete v0 payload", () => {
    const result = validateOwnershipEvidence(
      validEvidence({ asin: "b0earbud01", parentAsin: " b0earbprn1 " }),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.asin).toBe("B0EARBUD01");
      expect(result.value.parentAsin).toBe("B0EARBPRN1");
    }
  });

  it("rejects non-Amazon retailer and non-US marketplace", () => {
    const result = validateOwnershipEvidence(
      validEvidence({ retailer: "walmart" as never, marketplace: "UK" as never }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("rejects an invalid ASIN", () => {
    const result = validateOwnershipEvidence(validEvidence({ asin: "short" }), NOW);
    expect(result.ok).toBe(false);
  });

  it("allows omitting optional fields", () => {
    const result = validateOwnershipEvidence(
      validEvidence({ parentAsin: undefined, purchaseMonth: undefined, hashedOrderId: undefined }),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hashedOrderId).toBeUndefined();
    }
  });
});
