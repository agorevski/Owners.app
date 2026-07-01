// @vitest-environment happy-dom
/**
 * E2E — Touchpoint 5: edge cases and hard invariants.
 *
 *   1. A pending or wrong-product owner cannot answer (OWNERSHIP_REQUIRED).
 *   2. No raw Amazon order id / shipping address / price / payment data is ever persisted —
 *      only minimized, hashed evidence survives the Orders scan.
 *   3. A provisional (exact-ASIN-only) product routes to the admin merge/verification queues.
 */

import { describe, expect, it } from "vitest";
import { scanOrdersPage } from "../../apps/extension/src/content/orders";
import { isHashedOrderId } from "../../apps/extension/src/lib/hash";
import { createHarness, seedUsers } from "../support/harness";
import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";

const RAW_ORDER_ID = "111-2223334-4445556";
const RAW_ADDRESS = "123 Private St";
const RAW_PRICE = "$79.99";
const RAW_PAYMENT = "Visa ending 4242";

const ORDERS_HTML = `
<body>
  <div class="order-card">
    <div class="order-header">Ordered on November 3, 2025 · ORDER # ${RAW_ORDER_ID}</div>
    <div class="shipping-address">Ship to: ${RAW_ADDRESS} — SHOULD NOT BE READ</div>
    <div class="a-price">${RAW_PRICE}</div>
    <div class="payment">${RAW_PAYMENT}</div>
    <a href="/Acme-Wireless-Earbuds/dp/B0EARBUDS1/ref=oh">Acme True Wireless Earbuds</a>
  </div>
</body>`;

function docFrom(html: string): Document {
  document.documentElement.innerHTML = html;
  return document;
}

function confidentEvidence(asin: string, parentAsin: string): SubmitOwnershipEvidenceRequest {
  return {
    retailer: "amazon",
    marketplace: "US",
    asin,
    parentAsin,
    purchaseMonth: "2025-11",
    hashedOrderId: `sha256:${asin}`,
    verificationMethod: "amazon_orders_user_initiated_scan",
    capturedAt: new Date().toISOString(),
    extensionVersion: "0.1.0",
  };
}

describe("edge: pending / wrong-product owners cannot answer", () => {
  it("blocks answering with a pending (unverified) claim", async () => {
    const { web, ctx } = createHarness();
    const { owner, shopper } = await seedUsers(ctx);

    // Provisional product (exact-ASIN only) -> claim stays pending.
    const provisional = await web.resolveProduct({ asin: "B0PROVIS01", marketplace: "US" });

    web.setPrincipal(shopper.id);
    const question = await web.createQuestion({
      canonicalProductId: provisional.canonicalProductId,
      body: "Is the case pocket friendly?",
    });

    web.setPrincipal(owner.id);
    const claim = await web.submitOwnershipClaim({
      retailer: "amazon",
      marketplace: "US",
      asin: "B0PROVIS01",
      purchaseMonth: "2026-01",
      hashedOrderId: "sha256:prov",
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: new Date().toISOString(),
      extensionVersion: "0.1.0",
    });
    expect(claim.status).toBe("pending");

    await expect(
      web.createAnswer({ questionId: question.id, body: "Trying to answer while pending." }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED" });
  });

  it("blocks answering a question for a product the owner has NOT verified", async () => {
    const { web, ctx } = createHarness();
    const { owner, shopper } = await seedUsers(ctx);

    // Owner is verified for the earbuds product...
    const earbuds = await web.resolveProduct({ asin: "B0EARBUDS1", parentAsin: "B0PARENTA1", marketplace: "US" });
    web.setPrincipal(owner.id);
    await web.submitOwnershipClaim(confidentEvidence("B0EARBUDS1", "B0PARENTA1"));

    // ...but a different canonical product has an open question.
    const other = await web.resolveProduct({ asin: "B0OTHERBD1", parentAsin: "B0OTHERPA1", marketplace: "US" });
    web.setPrincipal(shopper.id);
    const question = await web.createQuestion({
      canonicalProductId: other.canonicalProductId,
      body: "How's the mic for calls?",
    });

    // Owner (verified only for earbuds) cannot answer the other product's question.
    web.setPrincipal(owner.id);
    await expect(
      web.createAnswer({ questionId: question.id, body: "Wrong-product answer attempt." }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED" });
    expect(earbuds.canonicalProductId).not.toBe(other.canonicalProductId);
  });
});

describe("edge: privacy — only minimized, hashed evidence is persisted", () => {
  it("never persists raw order id, address, price, or payment data", async () => {
    const { web, ctx } = createHarness();
    const { owner } = await seedUsers(ctx);

    const scanned = await scanOrdersPage(docFrom(ORDERS_HTML));
    expect(scanned).toHaveLength(1);
    const evidence = scanned[0]!;

    // The scanner output itself is minimized.
    expect(isHashedOrderId(evidence.hashedOrderId)).toBe(true);
    expect(evidence.purchaseMonth).toBe("2025-11");
    const evidenceJson = JSON.stringify(evidence);
    for (const secret of [RAW_ORDER_ID, RAW_ADDRESS, RAW_PRICE, RAW_PAYMENT]) {
      expect(evidenceJson).not.toContain(secret);
    }

    // Persist it and then dump the ENTIRE store — nothing sensitive may appear anywhere.
    web.setPrincipal(owner.id);
    await web.submitOwnershipClaim(evidence);

    const products = await ctx.products.listAll();
    const asins = (
      await Promise.all(products.map((p) => ctx.products.listAsinsByProduct(p.id)))
    ).flat();
    const snapshot = JSON.stringify({
      products,
      asins,
      claims: await ctx.ownershipClaims.listAll(),
      questions: await ctx.questions.listAll(),
      answers: await ctx.answers.listAll(),
      reports: await ctx.reports.listAll(),
      events: await ctx.analyticsEvents.list(),
      adminActions: await ctx.adminActions.listAll(),
    });
    for (const secret of [RAW_ORDER_ID, RAW_ADDRESS, RAW_PRICE, RAW_PAYMENT]) {
      expect(snapshot).not.toContain(secret);
    }

    // The persisted claim keeps only the hashed order id.
    const [claim] = await ctx.ownershipClaims.listAll();
    expect(isHashedOrderId(claim!.hashedOrderId)).toBe(true);
  });
});

describe("edge: provisional product routes to admin merge/review", () => {
  it("surfaces provisional products and pending claims, then merges + approves", async () => {
    const { web, ctx } = createHarness();
    const { owner, admin } = await seedUsers(ctx);

    // Canonical target + provisional source (same real-world product, exact-ASIN listing).
    const canonical = await web.resolveProduct({ asin: "B0EARBUDS1", parentAsin: "B0PARENTA1", marketplace: "US" });
    const provisional = await web.resolveProduct({ asin: "B0PROVIS01", title: "AirBeats (Midnight) provisional", marketplace: "US" });
    expect(provisional.provisional).toBe(true);

    // A shopper question + a pending claim attach to the provisional product.
    web.setPrincipal(owner.id);
    const question = await web.createQuestion({ canonicalProductId: provisional.canonicalProductId, body: "Same as the main model?" });
    const claim = await web.submitOwnershipClaim({
      retailer: "amazon",
      marketplace: "US",
      asin: "B0PROVIS01",
      purchaseMonth: "2026-01",
      hashedOrderId: "sha256:prov",
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: new Date().toISOString(),
      extensionVersion: "0.1.0",
    });
    expect(claim.status).toBe("pending");

    // Admin queues: provisional product appears for merge; claim appears for review.
    const provisionalList = await web.listProvisionalProducts();
    expect(provisionalList.map((p) => p.id)).toContain(provisional.canonicalProductId);
    const pending = await web.listPendingClaims();
    expect(pending.map((p) => p.claim.id)).toContain(claim.claimId);

    // Admin merges provisional -> canonical, preserving ASINs and Q&A references.
    web.setPrincipal(admin.id);
    const merge = await web.mergeProducts(provisional.canonicalProductId, canonical.canonicalProductId, "Same model");
    expect(merge.movedAsins).toBe(1);
    expect(merge.movedQuestions).toBe(1);

    // The question now lives under the canonical product; provisional is gone from listings.
    const moved = await ctx.questions.findById(question.id);
    expect(moved?.canonicalProductId).toBe(canonical.canonicalProductId);
    const remaining = await web.listAllProducts();
    expect(remaining.map((p) => p.id)).not.toContain(provisional.canonicalProductId);

    // Admin approves the ambiguous claim -> verified.
    const decision = await web.decideVerification(claim.claimId, "approve", "Evidence looks good");
    expect(decision.status).toBe("verified");
    expect((await ctx.ownershipClaims.findById(claim.claimId))?.status).toBe("verified");

    // Every admin action was audited (merge + verification decision).
    const actions = await ctx.adminActions.listAll();
    expect(actions.length).toBe(2);
    expect(actions.map((a) => a.action)).toEqual(
      expect.arrayContaining(["product_merge", "verification_approve"]),
    );
  });
});
