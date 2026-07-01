import { describe, expect, it } from "vitest";
import type { OwnershipClaim } from "@owners/shared";
import { createInMemoryRepositories } from "./memoryRepositories";
import { createAnswer, createQuestion, isApiError, resolveProduct } from "./handlers";

async function seedProductAndQuestion() {
  const ctx = createInMemoryRepositories();
  const resolved = await resolveProduct(ctx, { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" });
  if (isApiError(resolved)) throw new Error("resolve failed");
  const question = await createQuestion(ctx, "shopper-1", {
    canonicalProductId: resolved.canonicalProductId,
    body: "Do these fit small ears?",
  });
  if (isApiError(question)) throw new Error("question failed");
  return { ctx, canonicalProductId: resolved.canonicalProductId, questionId: question.id };
}

describe("prototype API handlers", () => {
  it("resolves a canonical (non-provisional) product when parent ASIN is present", async () => {
    const ctx = createInMemoryRepositories();
    const result = await resolveProduct(ctx, { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" });
    expect(isApiError(result)).toBe(false);
    if (!isApiError(result)) {
      expect(result.provisional).toBe(false);
    }
  });

  it("blocks answers without a verified ownership claim (OWNERSHIP_REQUIRED)", async () => {
    const { ctx, questionId } = await seedProductAndQuestion();
    const result = await createAnswer(ctx, "owner-1", { questionId, body: "Yes, snug fit." });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) {
      expect(result.error.code).toBe("OWNERSHIP_REQUIRED");
    }
  });

  it("allows answers once the author has a verified ownership claim", async () => {
    const { ctx, canonicalProductId, questionId } = await seedProductAndQuestion();
    const claim: OwnershipClaim = {
      id: crypto.randomUUID(),
      userId: "owner-1",
      canonicalProductId,
      method: "amazon_orders_user_initiated_scan",
      status: "verified",
      confidence: 0.95,
      asin: "B0EXAMPLE1",
      createdAt: new Date().toISOString(),
    };
    await ctx.ownershipClaims.create(claim);

    const result = await createAnswer(ctx, "owner-1", { questionId, body: "Yes, snug fit." });
    expect(isApiError(result)).toBe(false);
    if (!isApiError(result)) {
      expect(result.ownershipClaimId).toBe(claim.id);
    }
  });
});
