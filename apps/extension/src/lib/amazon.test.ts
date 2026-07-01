// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  extractAsin,
  extractAsinFromDom,
  extractAsinFromUrl,
  extractParentAsin,
  isAllowedAmazonHost,
  isOrdersPage,
  isProductDetailPage,
  looksLikeEarbuds,
  parsePurchaseMonth,
} from "./amazon";

function docFrom(html: string): Document {
  document.documentElement.innerHTML = html;
  return document;
}

describe("ASIN extraction from URL", () => {
  it("extracts from /dp/ URLs", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/dp/B0EXAMPLE1")).toBe("B0EXAMPLE1");
  });
  it("extracts from /gp/product/ URLs", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/gp/product/B0EXAMPLE1/ref=x")).toBe("B0EXAMPLE1");
  });
  it("extracts from slugged /Product-Name/dp/ URLs", () => {
    expect(
      extractAsinFromUrl("https://www.amazon.com/Acme-Wireless-Earbuds/dp/b0example1?th=1"),
    ).toBe("B0EXAMPLE1");
  });
  it("extracts from mobile /gp/aw/d/ URLs", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/gp/aw/d/B0EXAMPLE1")).toBe("B0EXAMPLE1");
  });
  it("returns undefined when no ASIN present", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/gp/css/order-history")).toBeUndefined();
  });
  it("does not match affiliate-looking non-ASIN segments", () => {
    expect(extractAsinFromUrl("https://www.amazon.com/s?k=earbuds")).toBeUndefined();
  });
});

describe("parent ASIN extraction (DOM)", () => {
  it("reads a data-parent-asin attribute", () => {
    const doc = docFrom(`<body><div data-parent-asin="B0PARENT01"></div></body>`);
    expect(extractParentAsin(doc)).toBe("B0PARENT01");
  });
  it("reads the twister hidden input", () => {
    const doc = docFrom(`<body><input name="parentAsin" value="b0parent01" /></body>`);
    expect(extractParentAsin(doc)).toBe("B0PARENT01");
  });
  it("reads embedded JSON parentAsin", () => {
    const doc = docFrom(`<body><script>var x = {"parentAsin":"B0PARENT01"};</script></body>`);
    expect(extractParentAsin(doc)).toBe("B0PARENT01");
  });
  it("returns undefined when absent or invalid", () => {
    expect(extractParentAsin(docFrom(`<body><div data-parent-asin="bad"></div></body>`))).toBeUndefined();
  });
});

describe("ASIN from DOM fallback", () => {
  it("reads input#ASIN then falls back to canonical link", () => {
    expect(extractAsinFromDom(docFrom(`<body><input id="ASIN" value="B0EXAMPLE1" /></body>`))).toBe("B0EXAMPLE1");
    const canonical = docFrom(`<head><link rel="canonical" href="https://www.amazon.com/dp/B0EXAMPLE1" /></head><body></body>`);
    expect(extractAsinFromDom(canonical)).toBe("B0EXAMPLE1");
  });
  it("extractAsin prefers URL over DOM", () => {
    const doc = docFrom(`<body><input id="ASIN" value="B0FROMDOM1" /></body>`);
    expect(extractAsin("https://www.amazon.com/dp/B0FROMURL1", doc)).toBe("B0FROMURL1");
  });
});

describe("host + page matching", () => {
  it("allows only www/smile amazon.com", () => {
    expect(isAllowedAmazonHost("https://www.amazon.com/dp/B0EXAMPLE1")).toBe(true);
    expect(isAllowedAmazonHost("https://smile.amazon.com/dp/B0EXAMPLE1")).toBe(true);
    expect(isAllowedAmazonHost("https://www.amazon.co.uk/dp/B0EXAMPLE1")).toBe(false);
    expect(isAllowedAmazonHost("https://evil.com/dp/B0EXAMPLE1")).toBe(false);
    expect(isAllowedAmazonHost("https://www.amazon.com.evil.com/dp/B0EXAMPLE1")).toBe(false);
  });
  it("detects product detail pages", () => {
    expect(isProductDetailPage("https://www.amazon.com/dp/B0EXAMPLE1")).toBe(true);
    expect(isProductDetailPage("https://www.amazon.com/gp/css/order-history")).toBe(false);
    expect(isProductDetailPage("https://www.amazon.co.uk/dp/B0EXAMPLE1")).toBe(false);
  });
  it("detects orders pages", () => {
    expect(isOrdersPage("https://www.amazon.com/gp/css/order-history?ref=x")).toBe(true);
    expect(isOrdersPage("https://www.amazon.com/gp/your-account/order-history")).toBe(true);
    expect(isOrdersPage("https://www.amazon.com/your-orders/orders")).toBe(true);
    expect(isOrdersPage("https://www.amazon.com/dp/B0EXAMPLE1")).toBe(false);
  });
});

describe("earbud heuristic", () => {
  it("matches earbud/in-ear titles", () => {
    expect(looksLikeEarbuds("Acme True Wireless Earbuds")).toBe(true);
    expect(looksLikeEarbuds("Bose In-Ear Earphones")).toBe(true);
    expect(looksLikeEarbuds("Galaxy Buds Pro")).toBe(true);
  });
  it("rejects non-earbud audio and unrelated products", () => {
    expect(looksLikeEarbuds("Sony Over-Ear Headphones")).toBe(false);
    expect(looksLikeEarbuds("USB-C Charging Cable")).toBe(false);
    expect(looksLikeEarbuds(undefined)).toBe(false);
  });
});

describe("purchase month parsing (coarse, no exact day)", () => {
  it("parses named month dates and drops the day", () => {
    expect(parsePurchaseMonth("Ordered on November 3, 2025")).toBe("2025-11");
    expect(parsePurchaseMonth("Jan 15, 2024")).toBe("2024-01");
  });
  it("parses numeric formats", () => {
    expect(parsePurchaseMonth("2025-11-03")).toBe("2025-11");
    expect(parsePurchaseMonth("11/3/2025")).toBe("2025-11");
  });
  it("returns undefined when no date present", () => {
    expect(parsePurchaseMonth("no date here")).toBeUndefined();
  });
});
