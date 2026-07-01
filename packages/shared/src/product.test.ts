import { describe, expect, it } from "vitest";
import {
  canonicalGroupingKey,
  isProvisionalResolution,
  isValidAsin,
  normalizeAsin,
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
