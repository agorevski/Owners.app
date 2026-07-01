import { describe, expect, it } from "vitest";
import { buildAmazonHandoffUrl, hasAffiliateTag, stripAffiliateParams } from "./handoff";

describe("compliant Amazon handoff (v0: no affiliate tag)", () => {
  it("builds a clean canonical product URL with no affiliate tag", () => {
    const url = buildAmazonHandoffUrl("B0EXAMPLE1");
    expect(url).toBe("https://www.amazon.com/dp/B0EXAMPLE1");
    expect(hasAffiliateTag(url)).toBe(false);
    expect(url).not.toMatch(/[?&]tag=/i);
  });

  it("detects affiliate/attribution tags", () => {
    expect(hasAffiliateTag("https://www.amazon.com/dp/B0X?tag=owners-20")).toBe(true);
    expect(hasAffiliateTag("https://www.amazon.com/dp/B0X?ascsubtag=abc")).toBe(true);
    expect(hasAffiliateTag("https://www.amazon.com/dp/B0X?ref_=nav")).toBe(true);
    expect(hasAffiliateTag("https://www.amazon.com/dp/B0X")).toBe(false);
  });

  it("strips affiliate params without altering the product path (no last-click hijack)", () => {
    const cleaned = stripAffiliateParams("https://www.amazon.com/dp/B0EXAMPLE1?tag=owners-20&th=1&foo=bar");
    expect(hasAffiliateTag(cleaned)).toBe(false);
    expect(cleaned).toContain("/dp/B0EXAMPLE1");
    expect(cleaned).toContain("foo=bar");
    expect(cleaned).not.toContain("tag=");
  });

  it("never injects a tag into a handoff URL for any ASIN", () => {
    for (const asin of ["B000000001", "B0ZZZZZZZZ", "B0EARBUD01"]) {
      expect(hasAffiliateTag(buildAmazonHandoffUrl(asin))).toBe(false);
    }
  });
});
