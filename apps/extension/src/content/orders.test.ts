// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractEarbudOrderRows, scanOrdersPage } from "./orders";
import { isHashedOrderId } from "../lib/hash";

/** Representative (minimized) Amazon Orders fixture: two orders, one earbud + one blender. */
const ORDERS_HTML = `
<body>
  <div class="order-card">
    <div class="order-header">Ordered on November 3, 2025 · ORDER # 111-2223334-4445556</div>
    <div class="shipping-address">Ship to: 123 Private St — SHOULD NOT BE READ</div>
    <div class="a-price">$79.99</div>
    <a href="/Acme-Wireless-Earbuds/dp/B0EARBUD01/ref=oh">Acme True Wireless Earbuds, Bluetooth</a>
  </div>
  <div class="order-card">
    <div class="order-header">Ordered on October 12, 2025 · ORDER # 222-3334445-5556667</div>
    <div class="a-price">$39.99</div>
    <a href="/dp/B0BLEND001">SuperBlend Countertop Blender 900W</a>
  </div>
</body>`;

function docFrom(html: string): Document {
  document.documentElement.innerHTML = html;
  return document;
}

describe("orders scanner: earbud-only, minimized evidence", () => {
  it("extracts only earbud rows (ignores unrelated categories)", () => {
    const rows = extractEarbudOrderRows(docFrom(ORDERS_HTML));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.asin).toBe("B0EARBUD01");
  });

  it("produces minimized evidence with no price/address/payment/raw order id", async () => {
    const evidence = await scanOrdersPage(docFrom(ORDERS_HTML));
    expect(evidence).toHaveLength(1);
    const e = evidence[0]!;
    expect(e).toMatchObject({
      retailer: "amazon",
      marketplace: "US",
      asin: "B0EARBUD01",
      purchaseMonth: "2025-11",
      verificationMethod: "amazon_orders_user_initiated_scan",
      extensionVersion: "0.1.0",
    });
    // Hashed order id present; raw order id never leaks.
    expect(isHashedOrderId(e.hashedOrderId)).toBe(true);
    const serialized = JSON.stringify(e);
    expect(serialized).not.toContain("111-2223334-4445556");
    expect(serialized).not.toContain("79.99");
    expect(serialized).not.toContain("123 Private St");
    // Payload has no forbidden fields.
    expect(Object.keys(e).sort()).toEqual(
      ["asin", "capturedAt", "extensionVersion", "hashedOrderId", "marketplace", "purchaseMonth", "retailer", "verificationMethod"].sort(),
    );
  });

  it("returns an empty payload when there are no earbud orders", async () => {
    const evidence = await scanOrdersPage(
      docFrom(`<body><div class="order-card"><a href="/dp/B0BLEND001">Blender</a></div></body>`),
    );
    expect(evidence).toEqual([]);
  });
});
