import { describe, expect, it } from "vitest";
import type { MinimalOwnershipEvidence, OwnershipClaim } from "./types";
import {
  AUTO_APPROVE_CONFIDENCE_THRESHOLD,
  canTransitionOwnershipClaim,
  canUserAnswer,
  computeOwnershipConfidence,
  createOwnershipClaimFromEvidence,
  evaluateOwnershipEvidence,
  isApprovedClaim,
  isVerifiedClaim,
} from "./ownership";

function evidence(overrides: Partial<MinimalOwnershipEvidence> = {}): MinimalOwnershipEvidence {
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

describe("ownership confidence", () => {
  it("scores complete Amazon Orders evidence at the method base strength", () => {
    expect(computeOwnershipConfidence(evidence())).toBe(0.9);
  });

  it("penalizes missing hashed order id, purchase month, and parent ASIN", () => {
    const weak = computeOwnershipConfidence(
      evidence({ hashedOrderId: undefined, purchaseMonth: undefined, parentAsin: undefined }),
    );
    expect(weak).toBeLessThan(0.9);
    expect(weak).toBeGreaterThan(0);
  });
});

describe("evaluateOwnershipEvidence", () => {
  it("auto-verifies confident, non-provisional, deduped claims", () => {
    const result = evaluateOwnershipEvidence(evidence());
    expect(result.status).toBe("verified");
    expect(result.confidence).toBeGreaterThanOrEqual(AUTO_APPROVE_CONFIDENCE_THRESHOLD);
  });

  it("routes provisional (no parent ASIN) claims to pending review", () => {
    expect(evaluateOwnershipEvidence(evidence({ parentAsin: undefined })).status).toBe("pending");
  });

  it("routes claims missing a hashed order id to pending review", () => {
    expect(evaluateOwnershipEvidence(evidence({ hashedOrderId: undefined })).status).toBe("pending");
  });
});

describe("createOwnershipClaimFromEvidence", () => {
  it("builds a verified claim with verifiedAt set", () => {
    const claim = createOwnershipClaimFromEvidence({
      id: "claim-1",
      userId: "owner-1",
      canonicalProductId: "prod-1",
      evidence: evidence(),
      createdAt: "2026-06-30T00:00:00Z",
    });
    expect(claim.status).toBe("verified");
    expect(claim.verifiedAt).toBe("2026-06-30T00:00:00Z");
    expect(claim.hashedOrderId).toBe(evidence().hashedOrderId);
  });

  it("omits verifiedAt for pending claims", () => {
    const claim = createOwnershipClaimFromEvidence({
      id: "claim-2",
      userId: "owner-1",
      canonicalProductId: "prod-1",
      evidence: evidence({ parentAsin: undefined }),
      createdAt: "2026-06-30T00:00:00Z",
    });
    expect(claim.status).toBe("pending");
    expect(claim.verifiedAt).toBeUndefined();
  });
});

describe("claim state machine", () => {
  it("permits documented transitions", () => {
    expect(canTransitionOwnershipClaim("pending", "verified")).toBe(true);
    expect(canTransitionOwnershipClaim("pending", "rejected")).toBe(true);
    expect(canTransitionOwnershipClaim("verified", "revoked")).toBe(true);
    expect(canTransitionOwnershipClaim("rejected", "pending")).toBe(true);
  });

  it("forbids illegal transitions and treats revoked as terminal", () => {
    expect(canTransitionOwnershipClaim("pending", "revoked")).toBe(false);
    expect(canTransitionOwnershipClaim("revoked", "verified")).toBe(false);
    expect(canTransitionOwnershipClaim("rejected", "verified")).toBe(false);
  });
});

describe("answer authorization", () => {
  const verified: Pick<OwnershipClaim, "status" | "canonicalProductId"> = {
    status: "verified",
    canonicalProductId: "prod-1",
  };

  it("treats verified and approved as synonyms", () => {
    expect(isVerifiedClaim(verified)).toBe(true);
    expect(isApprovedClaim(verified)).toBe(true);
  });

  it("allows answering only with a verified claim for the same product", () => {
    expect(canUserAnswer(verified, "prod-1")).toBe(true);
  });

  it("blocks answering for a different product", () => {
    expect(canUserAnswer(verified, "prod-2")).toBe(false);
  });

  it("blocks answering with pending/rejected/revoked or missing claims", () => {
    expect(canUserAnswer({ status: "pending", canonicalProductId: "prod-1" }, "prod-1")).toBe(false);
    expect(canUserAnswer({ status: "revoked", canonicalProductId: "prod-1" }, "prod-1")).toBe(false);
    expect(canUserAnswer(null, "prod-1")).toBe(false);
    expect(canUserAnswer(undefined, "prod-1")).toBe(false);
  });
});
