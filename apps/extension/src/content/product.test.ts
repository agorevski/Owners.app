// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  BADGE_CONTAINER_ID,
  FORBIDDEN_HOST_SELECTORS,
  buildProductDetection,
  renderCalmEntryPoint,
} from "./product";

/** Amazon-like PDP with price, cart, buy-now, reviews, and checkout nodes present. */
const PDP_HTML = `
<head><title>Acme True Wireless Earbuds</title></head>
<body>
  <span class="a-price" id="priceblock_ourprice">$79.99</span>
  <button id="add-to-cart-button">Add to Cart</button>
  <button id="buy-now-button">Buy Now</button>
  <span id="acrCustomerReviewText">1,234 ratings</span>
  <form action="/gp/checkout"><button id="checkout">Checkout</button></form>
  <div data-parent-asin="B0PARENT01"></div>
</body>`;

function docFrom(html: string): Document {
  document.documentElement.innerHTML = html;
  return document;
}

describe("product detection", () => {
  it("builds a PRODUCT_DETECTED message with ASIN + parent ASIN", () => {
    const doc = docFrom(PDP_HTML);
    const d = buildProductDetection("https://www.amazon.com/dp/B0EARBUD01", doc);
    expect(d?.message).toMatchObject({
      type: "PRODUCT_DETECTED",
      asin: "B0EARBUD01",
      parentAsin: "B0PARENT01",
      title: "Acme True Wireless Earbuds",
    });
  });

  it("returns undefined on non-product pages", () => {
    expect(buildProductDetection("https://www.amazon.com/gp/css/order-history", docFrom(PDP_HTML))).toBeUndefined();
    expect(buildProductDetection("https://www.amazon.co.uk/dp/B0EARBUD01", docFrom(PDP_HTML))).toBeUndefined();
  });
});

describe("calm entry point never mutates host price/cart/checkout/review DOM", () => {
  it("appends only an isolated container and leaves host nodes untouched", () => {
    const doc = docFrom(PDP_HTML);
    const before = new Map<string, string>();
    for (const sel of FORBIDDEN_HOST_SELECTORS) {
      const el = doc.querySelector(sel);
      if (el) before.set(sel, el.outerHTML);
    }

    const onOpen = vi.fn();
    const container = renderCalmEntryPoint(doc, { onOpen });

    // Our container exists and is a direct child of body (not injected into host CTAs).
    expect(container.id).toBe(BADGE_CONTAINER_ID);
    expect(container.parentElement).toBe(doc.body);

    // Every forbidden host node is byte-for-byte unchanged.
    for (const [sel, html] of before) {
      expect(doc.querySelector(sel)!.outerHTML).toBe(html);
    }

    // The entry point opens the sidebar on click and does not navigate/reload.
    container.querySelector("button")!.dispatchEvent(new Event("click"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("is idempotent (no duplicate entry points)", () => {
    const doc = docFrom(PDP_HTML);
    renderCalmEntryPoint(doc, { onOpen: () => {} });
    renderCalmEntryPoint(doc, { onOpen: () => {} });
    expect(doc.querySelectorAll(`#${BADGE_CONTAINER_ID}`)).toHaveLength(1);
  });
});
