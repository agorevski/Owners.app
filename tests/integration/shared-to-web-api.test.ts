/**
 * Integration — Touchpoint 1: shared domain logic <-> web API.
 *
 * Proves the web API layer and the pure `@owners/shared` domain agree on the three
 * cross-component contracts that hold the product together:
 *   1. Product resolve uses the shared normalization/resolution rules.
 *   2. Ownership evidence validation/evaluation creates verified vs. pending claims per
 *      the shared confidence model.
 *   3. Answer authorization enforces the shared "approved claim" invariant.
 */

import { describe, expect, it } from "vitest";
import {
  canUserAnswer,
  evaluateOwnershipEvidence,
  isProvisionalResolution,
  normalizeAsin,
  resolveAmazonProduct,
  type SubmitOwnershipEvidenceRequest,
} from "@owners/shared";
import { createHarness, seedUsers } from "../support/harness";

function evidence(
  asin: string,
  parentAsin: string | undefined,
): SubmitOwnershipEvidenceRequest {
  return {
    retailer: "amazon",
    marketplace: "US",
    asin,
    ...(parentAsin ? { parentAsin } : {}),
    purchaseMonth: "2025-11",
    hashedOrderId: "sha256:abc",
    verificationMethod: "amazon_orders_user_initiated_scan",
    capturedAt: new Date().toISOString(),
    extensionVersion: "0.1.0",
  };
}

describe("shared <-> web API: product resolve", () => {
  it("normalizes ASIN casing/whitespace exactly like shared normalizeAsin", async () => {
    const { web } = createHarness();
    const res = await web.resolveProduct({ asin: "  b0earbuds1  ", parentAsin: "B0PARENTA1" });
    expect(res.canonicalProductId).toBeTruthy();
    // A second resolve with the normalized ASIN must return the SAME canonical product.
    const again = await web.resolveProduct({ asin: normalizeAsin("b0earbuds1") });
    expect(again.canonicalProductId).toBe(res.canonicalProductId);
  });

  it("marks parent-backed products canonical and exact-ASIN-only products provisional", async () => {
    const { web } = createHarness();
    const canonical = await web.resolveProduct({ asin: "B0EARBUDS1", parentAsin: "B0PARENTA1" });
    const provisional = await web.resolveProduct({ asin: "B0PROVIS01" });

    // The API decision must match the pure shared resolution rule.
    expect(canonical.provisional).toBe(resolveAmazonProduct("B0EARBUDS1", "B0PARENTA1").provisional);
    expect(canonical.provisional).toBe(false);
    expect(provisional.provisional).toBe(isProvisionalResolution(undefined));
    expect(provisional.provisional).toBe(true);
  });

  it("rejects invalid ASINs at the API boundary (shared isValidAsin contract)", async () => {
    const { web } = createHarness();
    await expect(web.resolveProduct({ asin: "not-an-asin" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });
});

describe("shared <-> web API: ownership evidence -> claim status", () => {
  it("auto-verifies a confident (parent-backed) claim, matching evaluateOwnershipEvidence", async () => {
    const { web, ctx } = createHarness();
    const { owner } = await seedUsers(ctx);
    web.setPrincipal(owner.id);

    const ev = evidence("B0EARBUDS1", "B0PARENTA1");
    const evaluation = evaluateOwnershipEvidence(ev);
    expect(evaluation.status).toBe("verified");

    const res = await web.submitOwnershipClaim(ev);
    expect(res.status).toBe("verified");

    const status = await web.getClaimStatus(res.claimId);
    expect(status.status).toBe("verified");
    // The status endpoint must never leak raw evidence (hashed order id, purchase month, etc.).
    expect(Object.keys(status).sort()).toEqual(
      ["canonicalProductId", "confidence", "id", "status"].sort(),
    );
  });

  it("keeps an exact-ASIN-only (provisional) claim pending for admin review", async () => {
    const { web, ctx } = createHarness();
    const { owner } = await seedUsers(ctx);
    web.setPrincipal(owner.id);

    const ev = evidence("B0PROVIS01", undefined);
    expect(evaluateOwnershipEvidence(ev).status).toBe("pending");

    const res = await web.submitOwnershipClaim(ev);
    expect(res.status).toBe("pending");
  });

  it("refuses non-US / non-Amazon evidence at the boundary", async () => {
    const { web, ctx } = createHarness();
    const { owner } = await seedUsers(ctx);
    web.setPrincipal(owner.id);
    const bad = { ...evidence("B0EARBUDS1", "B0PARENTA1"), marketplace: "UK" } as unknown as SubmitOwnershipEvidenceRequest;
    await expect(web.submitOwnershipClaim(bad)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("shared <-> web API: answer authorization", () => {
  it("allows answering only with a verified claim for the question's product (canUserAnswer)", async () => {
    const { web, ctx } = createHarness();
    const { owner, shopper } = await seedUsers(ctx);

    const product = await web.resolveProduct({ asin: "B0EARBUDS1", parentAsin: "B0PARENTA1" });

    // Owner verifies -> verified claim.
    web.setPrincipal(owner.id);
    await web.submitOwnershipClaim(evidence("B0EARBUDS1", "B0PARENTA1"));
    const claim = await ctx.ownershipClaims.findVerified(owner.id, product.canonicalProductId);
    expect(claim).not.toBeNull();
    // The web enforcement and the pure shared predicate must agree.
    expect(canUserAnswer(claim, product.canonicalProductId)).toBe(true);

    // Shopper asks.
    web.setPrincipal(shopper.id);
    const question = await web.createQuestion({
      canonicalProductId: product.canonicalProductId,
      body: "Do these survive gym sweat?",
    });

    // Verified owner answers successfully.
    web.setPrincipal(owner.id);
    const answer = await web.createAnswer({ questionId: question.id, body: "Yes — 8 months, still fine." });
    expect(answer.ownershipClaimId).toBe(claim!.id);

    // Shopper (no claim) is blocked by the ownership invariant.
    web.setPrincipal(shopper.id);
    expect(canUserAnswer(null, product.canonicalProductId)).toBe(false);
    await expect(
      web.createAnswer({ questionId: question.id, body: "I don't own these." }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED" });
  });
});
