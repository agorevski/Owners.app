// @vitest-environment happy-dom
/**
 * Integration — Touchpoint 2: Chrome extension <-> web API contracts.
 *
 * Exercises the REAL extension code paths (DOM detection, Orders scanning, handoff URL
 * construction, analytics posting) against the REAL web router/handlers over the wired
 * `OwnersApiClient` transport. Proves:
 *   - Product detection output resolves to a canonical product via the API.
 *   - Orders-scanner evidence can submit an ownership claim.
 *   - The commerce handoff URL never carries an affiliate tag.
 *   - `commerce_handoff_clicked` analytics never persist an affiliate tag (server strips it).
 */

import { describe, expect, it } from "vitest";
import { buildProductDetection } from "../../apps/extension/src/content/product";
import { scanOrdersPage } from "../../apps/extension/src/content/orders";
import {
  buildAmazonHandoffUrl,
  hasAffiliateTag,
  stripAffiliateParams,
} from "../../apps/extension/src/lib/handoff";
import { createHarness, createWiredExtensionClient, seedUsers } from "../support/harness";

const PDP_URL = "https://www.amazon.com/dp/B0EARBUDS1/ref=whatever";
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
    <div class="shipping-address">Ship to: 123 Private St — SHOULD NOT BE READ</div>
    <div class="a-price">$79.99</div>
    <a href="/Acme-Wireless-Earbuds/dp/B0EARBUDS1/ref=oh">Acme True Wireless Earbuds, Bluetooth</a>
  </div>
  <div class="order-card">
    <div class="order-header">Ordered on October 12, 2025 · ORDER # 222-3334445-5556667</div>
    <div class="a-price">$39.99</div>
    <a href="/dp/B0BLEND001">SuperBlend Countertop Blender 900W</a>
  </div>
</body>`;

function docFrom(html: string, title?: string): Document {
  document.documentElement.innerHTML = html;
  if (title) document.title = title;
  return document;
}

describe("extension -> web API: product detection resolves via /products/resolve", () => {
  it("turns a detected PDP into a canonical, non-provisional product", async () => {
    const { ctx } = createHarness();
    const client = createWiredExtensionClient(ctx);

    const detection = buildProductDetection(PDP_URL, docFrom(PDP_HTML, "Acme AirBeats Pro Wireless Earbuds"));
    expect(detection).toBeDefined();
    const msg = detection!.message;
    expect(msg.asin).toBe("B0EARBUDS1");
    expect(msg.parentAsin).toBe("B0PARENTA1");

    const resolved = await client.resolveProduct({
      asin: msg.asin,
      parentAsin: msg.parentAsin,
      title: msg.title,
      marketplace: "US",
    });
    expect(resolved.canonicalProductId).toBeTruthy();
    expect(resolved.provisional).toBe(false);
  });
});

describe("extension -> web API: Orders scan evidence submits an ownership claim", () => {
  it("submits minimized earbud evidence and receives a claim id + status", async () => {
    const { ctx } = createHarness();
    const { owner } = await seedUsers(ctx);
    const client = createWiredExtensionClient(ctx, owner.id);

    const evidence = await scanOrdersPage(docFrom(ORDERS_HTML));
    // Only the earbud row is treated as evidence (blender is ignored).
    expect(evidence).toHaveLength(1);
    expect(evidence[0]!.asin).toBe("B0EARBUDS1");

    const res = await client.submitOwnershipEvidence(evidence[0]!);
    expect(res.claimId).toBeTruthy();
    // No parent/variation data from the Orders page => ambiguous => routed to admin review.
    expect(res.status).toBe("pending");

    const persisted = await ctx.ownershipClaims.findById(res.claimId);
    expect(persisted?.userId).toBe(owner.id);
    expect(persisted?.method).toBe("amazon_orders_user_initiated_scan");
  });
});

describe("extension -> web API: no-affiliate commerce posture", () => {
  it("builds a handoff URL with no affiliate tag", () => {
    const url = buildAmazonHandoffUrl("B0EARBUDS1");
    expect(url).toBe("https://www.amazon.com/dp/B0EARBUDS1");
    expect(hasAffiliateTag(url)).toBe(false);
  });

  it("strips affiliate params from an already-tagged Amazon URL", () => {
    const tagged = "https://www.amazon.com/dp/B0EARBUDS1?tag=evil-20&psc=1&ref_=abc";
    expect(hasAffiliateTag(tagged)).toBe(true);
    const cleaned = stripAffiliateParams(tagged);
    expect(hasAffiliateTag(cleaned)).toBe(false);
    expect(cleaned).not.toContain("tag=");
  });

  it("never persists an affiliate tag on commerce_handoff_clicked (server strips it)", async () => {
    const { ctx } = createHarness();
    const { shopper } = await seedUsers(ctx);
    const client = createWiredExtensionClient(ctx, shopper.id);

    // Even if a caller tries to smuggle a tag via props, the server must drop it.
    await client.postEvent("commerce_handoff_clicked", {
      asin: "B0EARBUDS1",
      tag: "evil-20",
      url: "https://www.amazon.com/dp/B0EARBUDS1?tag=evil-20",
    });

    const events = await ctx.analyticsEvents.list();
    const handoff = events.find((e) => e.name === "commerce_handoff_clicked");
    expect(handoff).toBeDefined();
    expect(handoff!.props).not.toHaveProperty("tag");
    expect(JSON.stringify(handoff!.props)).not.toContain("tag=");
    expect(JSON.stringify(handoff!.props)).not.toContain("evil-20");
  });
});
