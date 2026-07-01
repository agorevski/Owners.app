import { describe, expect, it } from "vitest";
import {
  canonicalGroupingKey,
  isProvisionalResolution,
  isValidAsin,
  normalizeAsin,
  RESOLUTION_CONFIDENCE,
  resolveAmazonProduct,
} from "./product";

describe("product resolution helpers", () => {
  it("validates ASIN format", () => {
    expect(isValidAsin("B0EXAMPLE1")).toBe(true);
    expect(isValidAsin("b0example1")).toBe(true);
    expect(isValidAsin("short")).toBe(false);
    expect(isValidAsin("B0 EXAMPLE")).toBe(false);
  });

  it("normalizes ASINs to trimmed uppercase", () => {
    expect(normalizeAsin("  b0example1 ")).toBe("B0EXAMPLE1");
  });

  it("prefers parent ASIN for canonical grouping", () => {
    expect(canonicalGroupingKey("B0CHILD001", "B0PARENT01")).toBe("B0PARENT01");
  });

  it("falls back to exact ASIN when no valid parent", () => {
    expect(canonicalGroupingKey("B0CHILD001")).toBe("B0CHILD001");
    expect(canonicalGroupingKey("B0CHILD001", "bad")).toBe("B0CHILD001");
  });

  it("flags provisional resolution when parent data is missing", () => {
    expect(isProvisionalResolution()).toBe(true);
    expect(isProvisionalResolution("B0PARENT01")).toBe(false);
  });
});

describe("resolveAmazonProduct", () => {
  it("groups under the parent ASIN with high confidence when available", () => {
    const result = resolveAmazonProduct("b0child001", " b0parent01 ");
    expect(result.provisional).toBe(false);
    expect(result.canonicalKey).toBe("B0PARENT01");
    expect(result.parentAsin).toBe("B0PARENT01");
    expect(result.asin).toBe("B0CHILD001");
    expect(result.confidence).toBe(RESOLUTION_CONFIDENCE.canonical);
  });

  it("creates a provisional exact-ASIN resolution when no valid parent exists", () => {
    const result = resolveAmazonProduct("B0CHILD001", "bad");
    expect(result.provisional).toBe(true);
    expect(result.canonicalKey).toBe("B0CHILD001");
    expect(result.parentAsin).toBeUndefined();
    expect(result.confidence).toBe(RESOLUTION_CONFIDENCE.provisional);
  });
});
