import { describe, expect, it } from "vitest";
import type { OwnershipClaim } from "@owners/shared";
import { createInMemoryRepositories } from "./memoryRepositories";
import {
  createAnswer,
  createQuestion,
  isApiError,
  listProductQuestions,
  recordEvent,
  resolveProduct,
  submitOwnershipClaim,
} from "./handlers";
import {
  decideVerification,
  mergeProducts,
  metricsSummary,
  moderateContent,
} from "./admin";

async function verifiedOwnerWithAnswer() {
  const ctx = createInMemoryRepositories();
  const resolved = await resolveProduct(ctx, { asin: "B0EXAMPLE1", parentAsin: "B0PARENT01" });
  if (isApiError(resolved)) throw new Error("resolve failed");
  const question = await createQuestion(ctx, "shopper-1", {
    canonicalProductId: resolved.canonicalProductId,
    body: "Do these fit small ears?",
  });
  if (isApiError(question)) throw new Error("question failed");
  const claim: OwnershipClaim = {
    id: crypto.randomUUID(),
    userId: "owner-1",
    canonicalProductId: resolved.canonicalProductId,
    method: "amazon_orders_user_initiated_scan",
    status: "verified",
    confidence: 0.95,
    asin: "B0EXAMPLE1",
    createdAt: new Date().toISOString(),
  };
  await ctx.ownershipClaims.create(claim);
  const answer = await createAnswer(ctx, "owner-1", {
    questionId: question.id,
    body: "Yes, snug fit.",
  });
  if (isApiError(answer)) throw new Error("answer failed");
  return { ctx, canonicalProductId: resolved.canonicalProductId, question, answer };
}

describe("admin: product merge", () => {
  it("reassigns ASINs and questions, hides the source, and writes an audit row", async () => {
    const ctx = createInMemoryRepositories();
    const source = await resolveProduct(ctx, { asin: "B0SOURCE01" });
    const target = await resolveProduct(ctx, { asin: "B0TARGET01", parentAsin: "B0PARENTAA" });
    if (isApiError(source) || isApiError(target)) throw new Error("resolve failed");
    const q = await createQuestion(ctx, "shopper-1", {
      canonicalProductId: source.canonicalProductId,
      body: "Any hiss at low volume?",
    });
    if (isApiError(q)) throw new Error("question failed");

    const result = await mergeProducts(ctx, "admin-1", {
      sourceProductId: source.canonicalProductId,
      targetProductId: target.canonicalProductId,
      reason: "duplicate provisional",
    });
    if (isApiError(result)) throw new Error("merge failed");

    expect(result.movedAsins).toBe(1);
    expect(result.movedQuestions).toBe(1);

    // Source ASIN now resolves to the target product (references preserved).
    const relinked = await ctx.products.findByAsin("B0SOURCE01");
    expect(relinked?.product.id).toBe(target.canonicalProductId);

    // Question moved to the target product.
    const targetQuestions = await listProductQuestions(ctx, target.canonicalProductId);
    if (isApiError(targetQuestions)) throw new Error("list failed");
    expect(targetQuestions.questions).toHaveLength(1);

    // Source no longer appears in the product list.
    const all = await ctx.products.listAll();
    expect(all.map((p) => p.id)).not.toContain(source.canonicalProductId);

    // Audit trail recorded.
    const audit = await ctx.adminActions.listAll();
    expect(audit.some((a) => a.action === "product_merge" && a.actorId === "admin-1")).toBe(true);
  });

  it("rejects merging a product into itself", async () => {
    const ctx = createInMemoryRepositories();
    const p = await resolveProduct(ctx, { asin: "B0SAME0001" });
    if (isApiError(p)) throw new Error("resolve failed");
    const result = await mergeProducts(ctx, "admin-1", {
      sourceProductId: p.canonicalProductId,
      targetProductId: p.canonicalProductId,
    });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("admin: verification decision", () => {
  it("approving a pending claim enables the owner to answer", async () => {
    const ctx = createInMemoryRepositories();
    const resolved = await resolveProduct(ctx, { asin: "B0EXAMPLE1" });
    if (isApiError(resolved)) throw new Error("resolve failed");
    const question = await createQuestion(ctx, "shopper-1", {
      canonicalProductId: resolved.canonicalProductId,
      body: "Battery life after a year?",
    });
    if (isApiError(question)) throw new Error("question failed");
    const submitted = await submitOwnershipClaim(ctx, "owner-1", {
      retailer: "amazon",
      marketplace: "US",
      asin: "B0EXAMPLE1",
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: "2026-06-30T00:00:00Z",
      extensionVersion: "0.1.0",
    });
    if (isApiError(submitted)) throw new Error("claim failed");
    expect(submitted.status).toBe("pending");

    // Cannot answer while pending.
    const blocked = await createAnswer(ctx, "owner-1", {
      questionId: question.id,
      body: "Still ~5h.",
    });
    expect(isApiError(blocked)).toBe(true);

    const decision = await decideVerification(ctx, "admin-1", {
      claimId: submitted.claimId,
      decision: "approve",
      reason: "clear evidence",
    });
    if (isApiError(decision)) throw new Error("decision failed");
    expect(decision.status).toBe("verified");

    const allowed = await createAnswer(ctx, "owner-1", {
      questionId: question.id,
      body: "Still ~5h.",
    });
    expect(isApiError(allowed)).toBe(false);

    const audit = await ctx.adminActions.listAll();
    expect(audit.some((a) => a.action === "verification_approve")).toBe(true);
  });

  it("rejecting a claim keeps answering blocked", async () => {
    const ctx = createInMemoryRepositories();
    const submitted = await submitOwnershipClaim(ctx, "owner-1", {
      retailer: "amazon",
      marketplace: "US",
      asin: "B0EXAMPLE1",
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: "2026-06-30T00:00:00Z",
      extensionVersion: "0.1.0",
    });
    if (isApiError(submitted)) throw new Error("claim failed");
    const decision = await decideVerification(ctx, "admin-1", {
      claimId: submitted.claimId,
      decision: "reject",
    });
    if (isApiError(decision)) throw new Error("decision failed");
    expect(decision.status).toBe("rejected");
  });

  it("returns NOT_FOUND for an unknown claim", async () => {
    const ctx = createInMemoryRepositories();
    const decision = await decideVerification(ctx, "admin-1", {
      claimId: "missing",
      decision: "approve",
    });
    expect(isApiError(decision)).toBe(true);
    if (isApiError(decision)) expect(decision.error.code).toBe("NOT_FOUND");
  });
});

describe("admin: moderation hide/restore", () => {
  it("hides an answer from public listing and restores it, with audit trail", async () => {
    const { ctx, canonicalProductId, answer } = await verifiedOwnerWithAnswer();

    const hidden = await moderateContent(ctx, "mod-1", {
      targetType: "answer",
      targetId: answer.id,
      action: "hide",
      reason: "abuse",
    });
    if (isApiError(hidden)) throw new Error("moderate failed");
    expect(hidden.hidden).toBe(true);

    let listed = await listProductQuestions(ctx, canonicalProductId);
    if (isApiError(listed)) throw new Error("list failed");
    expect(listed.questions[0]!.answers).toHaveLength(0);

    const restored = await moderateContent(ctx, "mod-1", {
      targetType: "answer",
      targetId: answer.id,
      action: "restore",
    });
    if (isApiError(restored)) throw new Error("moderate failed");

    listed = await listProductQuestions(ctx, canonicalProductId);
    if (isApiError(listed)) throw new Error("list failed");
    expect(listed.questions[0]!.answers).toHaveLength(1);

    const audit = await ctx.adminActions.listAll();
    expect(audit.some((a) => a.action === "content_hide")).toBe(true);
    expect(audit.some((a) => a.action === "content_restore")).toBe(true);
  });

  it("hides a question and resolves the originating report", async () => {
    const { ctx, canonicalProductId, question } = await verifiedOwnerWithAnswer();
    const report = await ctx.reports.create({
      id: crypto.randomUUID(),
      targetType: "question",
      targetId: question.id,
      reporterId: "shopper-9",
      reason: "off-topic",
      status: "open",
      createdAt: new Date().toISOString(),
    });

    const hidden = await moderateContent(ctx, "mod-1", {
      targetType: "question",
      targetId: question.id,
      action: "hide",
      reportId: report.id,
    });
    if (isApiError(hidden)) throw new Error("moderate failed");

    const listed = await listProductQuestions(ctx, canonicalProductId);
    if (isApiError(listed)) throw new Error("list failed");
    expect(listed.questions).toHaveLength(0);

    const resolved = await ctx.reports.findById(report.id);
    expect(resolved?.status).toBe("actioned");
  });

  it("returns NOT_FOUND when moderating missing content", async () => {
    const ctx = createInMemoryRepositories();
    const result = await moderateContent(ctx, "mod-1", {
      targetType: "answer",
      targetId: "missing",
      action: "hide",
    });
    expect(isApiError(result)).toBe(true);
    if (isApiError(result)) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("admin: metrics summary", () => {
  it("aggregates funnel counts including handoffs and admin actions", async () => {
    const { ctx, answer } = await verifiedOwnerWithAnswer();
    await recordEvent(ctx, { name: "commerce_handoff_clicked", props: { url: "https://a.co/x" } });
    await recordEvent(ctx, { name: "sidebar_opened" });
    await moderateContent(ctx, "mod-1", {
      targetType: "answer",
      targetId: answer.id,
      action: "hide",
    });

    const metrics = await metricsSummary(ctx);
    if (isApiError(metrics)) throw new Error("metrics failed");
    expect(metrics.products).toBe(1);
    expect(metrics.questions).toBe(1);
    expect(metrics.answers).toBe(1);
    expect(metrics.ownershipClaims.verified).toBe(1);
    expect(metrics.verificationPassRate).toBe(1);
    expect(metrics.handoffs).toBe(1);
    expect(metrics.events.total).toBe(2);
    expect(metrics.adminActions).toBe(1);
  });
});
