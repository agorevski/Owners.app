import { describe, expect, it } from "vitest";
import { createInMemoryRepositories } from "./memoryRepositories";
import { handleApiRequest } from "./router";

async function json(ctx = createInMemoryRepositories()) {
  return { ctx };
}

describe("router: end-to-end dispatch over the API surface", () => {
  it("resolves a product with 201 and lists its questions", async () => {
    const { ctx } = await json();
    const resolve = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/products/resolve",
      body: { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" },
    });
    expect(resolve.status).toBe(201);
    const productId = (resolve.body as { canonicalProductId: string }).canonicalProductId;

    const ask = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/questions",
      principalId: "shopper-1",
      body: { canonicalProductId: productId, body: "Do these fit small ears?" },
    });
    expect(ask.status).toBe(201);

    const list = await handleApiRequest(ctx, {
      method: "GET",
      path: `/api/products/${productId}/questions`,
    });
    expect(list.status).toBe(200);
    expect((list.body as { questions: unknown[] }).questions).toHaveLength(1);
  });

  it("returns 403 OWNERSHIP_REQUIRED when answering without a verified claim", async () => {
    const { ctx } = await json();
    const resolve = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/products/resolve",
      body: { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" },
    });
    const productId = (resolve.body as { canonicalProductId: string }).canonicalProductId;
    const ask = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/questions",
      principalId: "shopper-1",
      body: { canonicalProductId: productId, body: "Fit?" },
    });
    const questionId = (ask.body as { id: string }).id;

    const answer = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/answers",
      principalId: "owner-1",
      body: { questionId, body: "Yes." },
    });
    expect(answer.status).toBe(403);
    expect((answer.body as { error: { code: string } }).error.code).toBe("OWNERSHIP_REQUIRED");
  });

  it("supports the ownership claim lifecycle over HTTP-ish calls", async () => {
    const { ctx } = await json();
    const submit = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/ownership/claims",
      principalId: "owner-1",
      body: {
        retailer: "amazon",
        marketplace: "US",
        asin: "B0EXAMPLE1",
        parentAsin: "B0PARENT01",
        verificationMethod: "amazon_orders_user_initiated_scan",
        capturedAt: "2026-06-30T00:00:00Z",
        extensionVersion: "0.1.0",
      },
    });
    expect(submit.status).toBe(201);
    const claimId = (submit.body as { claimId: string }).claimId;

    const status = await handleApiRequest(ctx, {
      method: "GET",
      path: `/api/ownership/claims/${claimId}`,
    });
    expect(status.status).toBe(200);
    expect((status.body as { status: string }).status).toBe("verified");
  });

  it("returns 404 for unknown routes and unknown claim ids", async () => {
    const { ctx } = await json();
    const noRoute = await handleApiRequest(ctx, { method: "GET", path: "/api/nope" });
    expect(noRoute.status).toBe(404);

    const noClaim = await handleApiRequest(ctx, {
      method: "GET",
      path: "/api/ownership/claims/does-not-exist",
    });
    expect(noClaim.status).toBe(404);
  });

  it("serves the admin metrics summary", async () => {
    const { ctx } = await json();
    const metrics = await handleApiRequest(ctx, { method: "GET", path: "/api/admin/metrics" });
    expect(metrics.status).toBe(200);
    expect((metrics.body as { products: number }).products).toBe(0);
  });

  it("validates input and returns 400 on a bad ASIN", async () => {
    const { ctx } = await json();
    const bad = await handleApiRequest(ctx, {
      method: "POST",
      path: "/api/products/resolve",
      body: { asin: "nope" },
    });
    expect(bad.status).toBe(400);
  });
});
