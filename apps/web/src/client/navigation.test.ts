import { describe, expect, it } from "vitest";
import { parseEntry } from "./navigation";

describe("parseEntry — shopper deep-link entry", () => {
  it("routes a productId query param to the product view", () => {
    expect(parseEntry("?productId=abc-123")).toEqual({
      view: "product",
      params: { productId: "abc-123" },
    });
  });

  it("carries extension-compatible asin/parentAsin params for later resolution", () => {
    expect(parseEntry("?asin=B0EARBUDS1&parentAsin=B0PARENTA1")).toEqual({
      view: "product",
      params: { asin: "B0EARBUDS1", parentAsin: "B0PARENTA1" },
    });
  });

  it("supports hash route state form", () => {
    expect(parseEntry("", "#/products/xyz")).toEqual({
      view: "product",
      params: { productId: "xyz" },
    });
  });

  it("maps view aliases to canonical view keys", () => {
    expect(parseEntry("?view=verify").view).toBe("ownerVerify");
    expect(parseEntry("?view=dashboard").view).toBe("ownerDashboard");
    expect(parseEntry("?view=admin").view).toBe("admin");
  });

  it("defaults to home with no params", () => {
    expect(parseEntry("")).toEqual({ view: "home", params: {} });
  });
});
