// @vitest-environment happy-dom
/**
 * E2E — Touchpoint 4: full happy path.
 *
 * Amazon earbuds PDP detection -> canonical product resolved -> owner verifies via Orders
 * evidence -> shopper asks -> verified owner answers -> shopper marks helpful -> disclosed
 * no-affiliate handoff -> admin metrics show the funnel events.
 *
 * Everything runs against a single shared in-memory context: the extension `OwnersApiClient`
 * (the real MV3 transport) and the web `LocalApiClient` both dispatch through the real
 * router/handlers, so this is a genuine cross-component end-to-end, just without a network.
 */

import { describe, expect, it } from "vitest";
import { buildProductDetection } from "../../apps/extension/src/content/product";
import { scanOrdersPage } from "../../apps/extension/src/content/orders";
import { buildAmazonHandoffUrl, hasAffiliateTag } from "../../apps/extension/src/lib/handoff";
import type { AnalyticsEventName } from "@owners/shared";
import { createHarness, createWiredExtensionClient, seedUsers } from "../support/harness";

const PDP_URL = "https://www.amazon.com/dp/B0EARBUDS1/ref=nav";
const PDP_HTML = `
<head><title>Acme AirBeats Pro Wireless Earbuds</title></head>
<body>
  <span class="a-price" id="priceblock_ourprice">$79.99</span>
  <button id="add-to-cart-button">Add to Cart</button>
  <div data-parent-asin="B0PARENTA1"></div>
</body>`;

const ORDERS_HTML = `
<body>
  <div class="order-card">
    <div class="order-header">Ordered on November 3, 2025 · ORDER # 111-2223334-4445556</div>
    <div class="shipping-address">Ship to: 123 Private St</div>
    <div class="a-price">$79.99</div>
    <a href="/Acme-Wireless-Earbuds/dp/B0EARBUDS1/ref=oh">Acme True Wireless Earbuds</a>
  </div>
</body>`;

function docFrom(html: string, title?: string): Document {
  document.documentElement.innerHTML = html;
  if (title) document.title = title;
  return document;
}

describe("E2E happy path: detect -> resolve -> verify -> ask -> answer -> helpful -> handoff -> metrics", () => {
  it("completes the full verified-owner Q&A funnel", async () => {
    const { web, ctx } = createHarness();
    const { owner, shopper, admin } = await seedUsers(ctx);

    // Anonymous + per-principal extension clients over the shared context.
    const anon = createWiredExtensionClient(ctx);
    const ownerExt = createWiredExtensionClient(ctx, owner.id);
    const shopperExt = createWiredExtensionClient(ctx, shopper.id);

    const emitted: AnalyticsEventName[] = [];
    const emit = async (name: AnalyticsEventName, props?: Record<string, string | number | boolean | null>) => {
      emitted.push(name);
      await anon.postEvent(name, props);
    };

    // 1) Extension detects the Amazon earbuds PDP.
    const detection = buildProductDetection(PDP_URL, docFrom(PDP_HTML, "Acme AirBeats Pro Wireless Earbuds"));
    expect(detection).toBeDefined();
    const { asin, parentAsin, title } = detection!.message;
    await emit("amazon_product_detected", { asin });

    // 2) Resolve to a canonical (non-provisional) product.
    const product = await anon.resolveProduct({ asin, parentAsin, title, marketplace: "US" });
    expect(product.provisional).toBe(false);

    // 3) Shopper opens the sidebar and asks.
    await emit("sidebar_opened");
    await emit("question_started");
    const question = await shopperExt.createQuestion({
      canonicalProductId: product.canonicalProductId,
      body: "Do these stay in during runs, and how's battery after a year?",
    });
    await emit("question_submitted");

    // 4) Owner verifies via a user-initiated Amazon Orders scan.
    await emit("owner_verification_started");
    await emit("amazon_orders_scan_started");
    const scanned = await scanOrdersPage(docFrom(ORDERS_HTML));
    expect(scanned).toHaveLength(1);
    // The sidebar composes the scanned ASIN with the parent ASIN detected on the PDP in the
    // same session, yielding a confident (auto-verifying) claim for the canonical product.
    const evidence = { ...scanned[0]!, parentAsin };
    await emit("ownership_claim_submitted", { asin: evidence.asin });
    const claim = await ownerExt.submitOwnershipEvidence(evidence);
    expect(claim.status).toBe("verified");
    await emit("ownership_claim_approved", { asin: evidence.asin });

    // The verified claim covers the same canonical product the question is attached to.
    const verified = await ctx.ownershipClaims.findVerified(owner.id, product.canonicalProductId);
    expect(verified).not.toBeNull();

    // 5) Verified owner answers.
    const answer = await ownerExt.createAnswer({
      questionId: question.id,
      body: "8 months of running — they stay put with medium tips, battery still ~5h.",
    });
    await emit("answer_submitted");
    expect(answer.ownershipClaimId).toBe(verified!.id);

    // 6) Shopper marks the answer helpful.
    await shopperExt.markHelpful({ answerId: answer.id, helpful: true });
    await emit("answer_marked_helpful", { answerId: answer.id });

    // 7) Disclosed, no-affiliate "Continue to Amazon" handoff.
    const handoffUrl = buildAmazonHandoffUrl(asin);
    expect(hasAffiliateTag(handoffUrl)).toBe(false);
    await emit("commerce_handoff_clicked", { asin });

    // 8) Admin metrics show the funnel.
    web.setPrincipal(admin.id);
    const metrics = await web.metrics();
    expect(metrics.products).toBe(1);
    expect(metrics.questions).toBe(1);
    expect(metrics.answers).toBe(1);
    expect(metrics.ownershipClaims.verified).toBe(1);
    expect(metrics.handoffs).toBe(1);
    expect(metrics.events.total).toBe(emitted.length);
    for (const name of emitted) {
      expect(metrics.events.byName[name]).toBeGreaterThanOrEqual(1);
    }

    // The public product view shows a verified-owner answer with the helpful vote.
    const view = await web.getProductView(product.canonicalProductId);
    const answerView = view!.questions.find((q) => q.id === question.id)!.answers[0]!;
    expect(answerView.provenance).toBe("verified-owner");
    expect(answerView.claimStatus).toBe("verified");
    expect(answerView.helpfulCount).toBe(1);
    expect(view!.primaryAsin).toBe("B0EARBUDS1");
  });
});
