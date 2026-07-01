import { describe, expect, it } from "vitest";
import type {
  OwnershipClaim,
  SubmitOwnershipEvidenceRequest,
} from "@owners/shared";
import { createInMemoryRepositories } from "./memoryRepositories";
import {
  createAnswer,
  createQuestion,
  createReport,
  getOwnershipClaimStatus,
  isApiError,
  listProductQuestions,
  markHelpful,
  recordEvent,
  resolveProduct,
  submitOwnershipClaim,
} from "./handlers";

const VALID_EVIDENCE: SubmitOwnershipEvidenceRequest = {
  retailer: "amazon",
  marketplace: "US",
  asin: "B0EXAMPLE1",
  parentAsin: "B0PARENT01",
  purchaseMonth: "2025-11",
  hashedOrderId: "sha256:abc",
  verificationMethod: "amazon_orders_user_initiated_scan",
  capturedAt: "2026-06-30T00:00:00Z",
  extensionVersion: "0.1.0",
};

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

async function verifiedOwnerAnswer(userId = "owner-1") {
  const seeded = await seedProductAndQuestion();
  const claim: OwnershipClaim = {
    id: crypto.randomUUID(),
    userId,
    canonicalProductId: seeded.canonicalProductId,
    method: "amazon_orders_user_initiated_scan",
    status: "verified",
    confidence: 0.95,
    asin: "B0EXAMPLE1",
    createdAt: new Date().toISOString(),
  };
  await seeded.ctx.ownershipClaims.create(claim);
  const answer = await createAnswer(seeded.ctx, userId, {
    questionId: seeded.questionId,
    body: "Yes, snug fit.",
  });
  if (isApiError(answer)) throw new Error("answer failed");
  return { ...seeded, claim, answer };
}

describe("POST /api/products/resolve", () => {
  it("rejects an invalid ASIN", async () => {
    const ctx = createInMemoryRepositories();
    const result = await resolveProduct(ctx, { asin: "not-an-asin" });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates a non-provisional product when a parent ASIN is present", async () => {
    const ctx = createInMemoryRepositories();
    const result = await resolveProduct(ctx, { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" });
    expect(isApiError(result)).toBe(false);
    if (!isApiError(result)) expect(result.provisional).toBe(false);
  });

  it("creates a provisional product for an exact-ASIN-only lookup", async () => {
    const ctx = createInMemoryRepositories();
    const result = await resolveProduct(ctx, { asin: "B0EXAMPLE1" });
    expect(isApiError(result)).toBe(false);
    if (!isApiError(result)) expect(result.provisional).toBe(true);
  });

  it("is idempotent for the same ASIN", async () => {
    const ctx = createInMemoryRepositories();
    const first = await resolveProduct(ctx, { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" });
    const second = await resolveProduct(ctx, { asin: "B0EXAMPLE1" });
    if (isApiError(first) || isApiError(second)) throw new Error("resolve failed");
    expect(second.canonicalProductId).toBe(first.canonicalProductId);
  });
});

describe("GET /api/products/:id/questions", () => {
  it("returns NOT_FOUND for an unknown product", async () => {
    const ctx = createInMemoryRepositories();
    const result = await listProductQuestions(ctx, "missing");
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("lists questions with their answers", async () => {
    const { ctx, canonicalProductId } = await verifiedOwnerAnswer();
    const result = await listProductQuestions(ctx, canonicalProductId);
    if (isApiError(result)) throw new Error("list failed");
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]!.answers).toHaveLength(1);
  });
});

describe("POST /api/questions", () => {
  it("rejects an empty body", async () => {
    const { ctx, canonicalProductId } = await seedProductAndQuestion();
    const result = await createQuestion(ctx, "shopper-1", { canonicalProductId, body: "   " });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an unknown product", async () => {
    const ctx = createInMemoryRepositories();
    const result = await createQuestion(ctx, "shopper-1", {
      canonicalProductId: "nope",
      body: "hello?",
    });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/answers ownership enforcement", () => {
  it("blocks answers without any ownership claim (OWNERSHIP_REQUIRED)", async () => {
    const { ctx, questionId } = await seedProductAndQuestion();
    const result = await createAnswer(ctx, "owner-1", { questionId, body: "Yes." });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("OWNERSHIP_REQUIRED");
  });

  it("blocks answers when the claim is only pending", async () => {
    const { ctx, canonicalProductId, questionId } = await seedProductAndQuestion();
    await ctx.ownershipClaims.create({
      id: crypto.randomUUID(),
      userId: "owner-1",
      canonicalProductId,
      method: "amazon_orders_user_initiated_scan",
      status: "pending",
      confidence: 0.5,
      asin: "B0EXAMPLE1",
      createdAt: new Date().toISOString(),
    });
    const result = await createAnswer(ctx, "owner-1", { questionId, body: "Yes." });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("OWNERSHIP_REQUIRED");
  });

  it("blocks answers when the verified claim is for a different product", async () => {
    const { ctx, questionId } = await seedProductAndQuestion();
    await ctx.ownershipClaims.create({
      id: crypto.randomUUID(),
      userId: "owner-1",
      canonicalProductId: "some-other-product",
      method: "amazon_orders_user_initiated_scan",
      status: "verified",
      confidence: 0.95,
      asin: "B0OTHER001",
      createdAt: new Date().toISOString(),
    });
    const result = await createAnswer(ctx, "owner-1", { questionId, body: "Yes." });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("OWNERSHIP_REQUIRED");
  });

  it("allows answers once the author has a verified claim and marks the question answered", async () => {
    const { ctx, questionId, claim, answer } = await verifiedOwnerAnswer();
    expect(answer.ownershipClaimId).toBe(claim.id);
    const question = await ctx.questions.findById(questionId);
    expect(question?.status).toBe("answered");
  });
});

describe("POST /api/ownership/claims", () => {
  it("rejects an invalid ASIN", async () => {
    const ctx = createInMemoryRepositories();
    const result = await submitOwnershipClaim(ctx, "owner-1", {
      ...VALID_EVIDENCE,
      asin: "bad",
    });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("auto-verifies a confident parent-backed claim", async () => {
    const ctx = createInMemoryRepositories();
    const result = await submitOwnershipClaim(ctx, "owner-1", VALID_EVIDENCE);
    if (isApiError(result)) throw new Error("claim failed");
    expect(result.status).toBe("verified");
  });

  it("routes an exact-ASIN-only claim to pending review", async () => {
    const ctx = createInMemoryRepositories();
    const result = await submitOwnershipClaim(ctx, "owner-1", {
      ...VALID_EVIDENCE,
      parentAsin: undefined,
    });
    if (isApiError(result)) throw new Error("claim failed");
    expect(result.status).toBe("pending");
  });
});

describe("GET /api/ownership/claims/:id", () => {
  it("returns NOT_FOUND for an unknown claim", async () => {
    const ctx = createInMemoryRepositories();
    const result = await getOwnershipClaimStatus(ctx, "missing");
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("returns lifecycle status without exposing raw evidence", async () => {
    const ctx = createInMemoryRepositories();
    const submitted = await submitOwnershipClaim(ctx, "owner-1", VALID_EVIDENCE);
    if (isApiError(submitted)) throw new Error("claim failed");
    const result = await getOwnershipClaimStatus(ctx, submitted.claimId);
    if (isApiError(result)) throw new Error("status failed");
    expect(result.status).toBe("verified");
    expect(result).not.toHaveProperty("hashedOrderId");
  });
});

describe("POST /api/feedback/helpful", () => {
  it("returns NOT_FOUND for an unknown answer", async () => {
    const ctx = createInMemoryRepositories();
    const result = await markHelpful(ctx, "shopper-2", { answerId: "missing", helpful: true });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("records a helpful vote and increments the count", async () => {
    const { ctx, answer } = await verifiedOwnerAnswer();
    const result = await markHelpful(ctx, "shopper-2", { answerId: answer.id, helpful: true });
    if (isApiError(result)) throw new Error("vote failed");
    expect(result.recorded).toBe(true);
    expect(result.helpfulCount).toBe(1);
  });

  it("deduplicates a repeated identical vote (no double count)", async () => {
    const { ctx, answer } = await verifiedOwnerAnswer();
    await markHelpful(ctx, "shopper-2", { answerId: answer.id, helpful: true });
    const again = await markHelpful(ctx, "shopper-2", { answerId: answer.id, helpful: true });
    if (isApiError(again)) throw new Error("vote failed");
    expect(again.recorded).toBe(false);
    expect(again.helpfulCount).toBe(1);
  });

  it("adjusts the count when a vote is flipped", async () => {
    const { ctx, answer } = await verifiedOwnerAnswer();
    await markHelpful(ctx, "shopper-2", { answerId: answer.id, helpful: true });
    const flipped = await markHelpful(ctx, "shopper-2", { answerId: answer.id, helpful: false });
    if (isApiError(flipped)) throw new Error("vote failed");
    expect(flipped.recorded).toBe(true);
    expect(flipped.helpfulCount).toBe(0);
  });
});

describe("POST /api/reports", () => {
  it("rejects a missing reason", async () => {
    const ctx = createInMemoryRepositories();
    const result = await createReport(ctx, "shopper-2", {
      targetType: "answer",
      targetId: "a1",
      reason: "  ",
    });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("enqueues a report for moderation", async () => {
    const { ctx, answer } = await verifiedOwnerAnswer();
    const result = await createReport(ctx, "shopper-2", {
      targetType: "answer",
      targetId: answer.id,
      reason: "spam",
    });
    if (isApiError(result)) throw new Error("report failed");
    expect(result.status).toBe("open");
    const open = await ctx.reports.listOpen();
    expect(open).toHaveLength(1);
  });
});

describe("POST /api/events", () => {
  it("rejects an unknown event name", async () => {
    const ctx = createInMemoryRepositories();
    const result = await recordEvent(ctx, { name: "not_a_real_event" as never });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("records a funnel event", async () => {
    const ctx = createInMemoryRepositories();
    const result = await recordEvent(ctx, { name: "sidebar_opened", principalId: "shopper-2" });
    if (isApiError(result)) throw new Error("event failed");
    expect(result.name).toBe("sidebar_opened");
    expect(await ctx.analyticsEvents.list()).toHaveLength(1);
  });

  it("strips any affiliate tag from a commerce handoff event", async () => {
    const ctx = createInMemoryRepositories();
    const result = await recordEvent(ctx, {
      name: "commerce_handoff_clicked",
      props: {
        url: "https://www.amazon.com/dp/B0EXAMPLE1?tag=ownersapp-20&th=1",
        affiliateTag: "ownersapp-20",
        tag: "ownersapp-20",
      },
    });
    if (isApiError(result)) throw new Error("event failed");
    const serialized = JSON.stringify(result.props);
    expect(serialized).not.toContain("ownersapp-20");
    expect(serialized).not.toContain("tag=");
    expect(result.props?.url).toContain("th=1");
  });
});
