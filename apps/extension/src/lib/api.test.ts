import { describe, expect, it } from "vitest";
import { OwnersApiClient } from "./api";

interface Recorded {
  url: string;
  init?: RequestInit;
}

function fakeFetch(recorded: Recorded[], body: unknown = { ok: true }, ok = true) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    recorded.push({ url, init });
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    } as unknown as Response;
  };
}

describe("OwnersApiClient endpoint contracts", () => {
  it("posts product resolution to /products/resolve with the DTO", async () => {
    const rec: Recorded[] = [];
    const client = new OwnersApiClient({ baseUrl: "http://api.test/api", fetch: fakeFetch(rec, { canonicalProductId: "p1", title: "T", provisional: false, confidence: 0.9 }) });
    const res = await client.resolveProduct({ asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" });
    expect(res.canonicalProductId).toBe("p1");
    expect(rec[0]!.url).toBe("http://api.test/api/products/resolve");
    expect(rec[0]!.init?.method).toBe("POST");
    expect(JSON.parse(String(rec[0]!.init?.body))).toMatchObject({ asin: "B0EXAMPLE1" });
  });

  it("lists questions via GET with an encoded product id", async () => {
    const rec: Recorded[] = [];
    const client = new OwnersApiClient({ baseUrl: "http://api.test/api", fetch: fakeFetch(rec, { product: {}, questions: [] }) });
    await client.listQuestions("p 1");
    expect(rec[0]!.url).toBe("http://api.test/api/products/p%201/questions");
  });

  it("submits ownership evidence to /ownership/claims", async () => {
    const rec: Recorded[] = [];
    const client = new OwnersApiClient({ baseUrl: "http://api.test/api", fetch: fakeFetch(rec, { claimId: "c1", status: "pending" }) });
    const res = await client.submitOwnershipEvidence({
      retailer: "amazon",
      marketplace: "US",
      asin: "B0EXAMPLE1",
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: "2026-06-30T00:00:00Z",
      extensionVersion: "0.1.0",
    });
    expect(res.claimId).toBe("c1");
    expect(rec[0]!.url).toBe("http://api.test/api/ownership/claims");
  });

  it("attaches a bearer token when provided", async () => {
    const rec: Recorded[] = [];
    const client = new OwnersApiClient({ baseUrl: "http://api.test/api", fetch: fakeFetch(rec), getAuthToken: () => "tok123" });
    await client.postEvent("sidebar_opened");
    const headers = rec[0]!.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok123");
    expect(rec[0]!.url).toBe("http://api.test/api/events");
  });

  it("throws on non-2xx responses", async () => {
    const rec: Recorded[] = [];
    const client = new OwnersApiClient({ baseUrl: "http://api.test/api", fetch: fakeFetch(rec, {}, false) });
    await expect(client.resolveProduct({ asin: "B0EXAMPLE1" })).rejects.toThrow(/failed: 500/);
  });
});
