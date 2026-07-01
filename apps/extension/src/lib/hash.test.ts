import { describe, expect, it } from "vitest";
import { extractOrderId, hashOrderId, isHashedOrderId } from "./hash";

describe("order-id hashing (never store raw)", () => {
  it("extracts a canonical Amazon order id from noisy text", () => {
    expect(extractOrderId("Ordered on Nov 3 · ORDER # 111-2223334-4445556 total")).toBe("111-2223334-4445556");
    expect(extractOrderId("no order id here")).toBeUndefined();
  });

  it("produces a stable prefixed sha256 hash and never returns the raw id", async () => {
    const raw = "111-2223334-4445556";
    const h1 = await hashOrderId(raw);
    const h2 = await hashOrderId(raw);
    expect(h1).toBe(h2);
    expect(isHashedOrderId(h1)).toBe(true);
    expect(h1).not.toContain(raw);
  });

  it("different order ids hash differently", async () => {
    expect(await hashOrderId("111-2223334-4445556")).not.toBe(await hashOrderId("222-3334445-5556667"));
  });
});
