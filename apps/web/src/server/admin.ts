/**
 * Minimal admin console handlers for the v0 prototype.
 *
 * Covers the four admin areas in docs/09-mvp-implementation-spec.md section 10:
 * product merges, verification review, moderation, and metrics. Every mutating admin action
 * writes an `admin_actions` audit row with actor, target, action, reason, and timestamp.
 */

import type {
  ApiError,
  ApiResult,
  OwnershipClaimStatus,
} from "@owners/shared";
import type { ModerationTargetType, WebRepositoryContext } from "./context";
import { isApiError } from "./handlers";

function apiError(code: ApiError["error"]["code"], message: string): ApiError {
  return { error: { code, message } };
}

function now(): string {
  return new Date().toISOString();
}

async function audit(
  ctx: WebRepositoryContext,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string,
): Promise<void> {
  await ctx.adminActions.create({
    id: crypto.randomUUID(),
    actorId,
    action,
    targetType,
    targetId,
    reason,
    createdAt: now(),
  });
}

// ---------------------------------------------------------------------------
// Product merge
// ---------------------------------------------------------------------------

export interface MergeProductsRequest {
  sourceProductId: string;
  targetProductId: string;
  reason?: string;
}

export interface MergeProductsResponse {
  sourceProductId: string;
  targetProductId: string;
  movedAsins: number;
  movedQuestions: number;
}

/**
 * Merge a provisional/source product into a target canonical product. Preserves all source
 * ASINs and Q&A references by reassigning them, then marks the source as merged.
 */
export async function mergeProducts(
  ctx: WebRepositoryContext,
  actorId: string,
  req: MergeProductsRequest,
): Promise<ApiResult<MergeProductsResponse>> {
  if (req.sourceProductId === req.targetProductId) {
    return apiError("VALIDATION_ERROR", "Cannot merge a product into itself.");
  }
  const source = await ctx.products.findById(req.sourceProductId);
  const target = await ctx.products.findById(req.targetProductId);
  if (!source || !target) {
    return apiError("NOT_FOUND", "Both source and target products must exist.");
  }

  const asins = await ctx.products.listAsinsByProduct(req.sourceProductId);
  for (const mapping of asins) {
    await ctx.products.relinkAsin(mapping.asin, req.targetProductId);
  }
  const movedQuestions = await ctx.questions.reassignProduct(
    req.sourceProductId,
    req.targetProductId,
  );
  await ctx.products.markMerged(req.sourceProductId, req.targetProductId);

  await audit(
    ctx,
    actorId,
    "product_merge",
    "canonical_product",
    req.sourceProductId,
    req.reason ?? `Merged into ${req.targetProductId}`,
  );

  return {
    sourceProductId: req.sourceProductId,
    targetProductId: req.targetProductId,
    movedAsins: asins.length,
    movedQuestions,
  };
}

// ---------------------------------------------------------------------------
// Verification review
// ---------------------------------------------------------------------------

export interface VerificationDecisionRequest {
  claimId: string;
  decision: "approve" | "reject";
  reason?: string;
}

export interface VerificationDecisionResponse {
  claimId: string;
  status: OwnershipClaimStatus;
}

/** Approve or reject an ambiguous ownership claim in the verification queue. */
export async function decideVerification(
  ctx: WebRepositoryContext,
  actorId: string,
  req: VerificationDecisionRequest,
): Promise<ApiResult<VerificationDecisionResponse>> {
  if (req.decision !== "approve" && req.decision !== "reject") {
    return apiError("VALIDATION_ERROR", "decision must be 'approve' or 'reject'.");
  }
  const claim = await ctx.ownershipClaims.findById(req.claimId);
  if (!claim) {
    return apiError("NOT_FOUND", "Ownership claim not found.");
  }

  const nextStatus: OwnershipClaimStatus = req.decision === "approve" ? "verified" : "rejected";
  const updated = await ctx.ownershipClaims.updateStatus(req.claimId, nextStatus);

  await audit(
    ctx,
    actorId,
    `verification_${req.decision}`,
    "ownership_claim",
    req.claimId,
    req.reason,
  );

  return { claimId: req.claimId, status: updated?.status ?? nextStatus };
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export interface ModerationActionRequest {
  targetType: ModerationTargetType;
  targetId: string;
  action: "hide" | "restore";
  reason?: string;
  /** Optional report id to resolve alongside the moderation action. */
  reportId?: string;
}

export interface ModerationActionResponse {
  targetType: ModerationTargetType;
  targetId: string;
  hidden: boolean;
}

/** Hide or restore reported content; optionally resolve the originating report. */
export async function moderateContent(
  ctx: WebRepositoryContext,
  actorId: string,
  req: ModerationActionRequest,
): Promise<ApiResult<ModerationActionResponse>> {
  if (req.targetType !== "question" && req.targetType !== "answer") {
    return apiError("VALIDATION_ERROR", "Moderation targets must be a question or answer.");
  }
  if (req.action !== "hide" && req.action !== "restore") {
    return apiError("VALIDATION_ERROR", "action must be 'hide' or 'restore'.");
  }

  const exists =
    req.targetType === "question"
      ? await ctx.questions.findById(req.targetId)
      : await ctx.answers.findById(req.targetId);
  if (!exists) {
    return apiError("NOT_FOUND", `${req.targetType} not found.`);
  }

  const hidden = req.action === "hide";
  if (hidden) {
    await ctx.moderation.hide(req.targetType, req.targetId);
  } else {
    await ctx.moderation.restore(req.targetType, req.targetId);
  }
  // Keep the question status field in sync so it does not silently misrepresent state.
  if (req.targetType === "question") {
    await ctx.questions.updateStatus(req.targetId, hidden ? "hidden" : "open");
  }

  if (req.reportId) {
    await ctx.reports.updateStatus(req.reportId, hidden ? "actioned" : "dismissed");
  }

  await audit(
    ctx,
    actorId,
    `content_${req.action}`,
    req.targetType,
    req.targetId,
    req.reason,
  );

  return { targetType: req.targetType, targetId: req.targetId, hidden };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface MetricsSummaryResponse {
  products: number;
  questions: number;
  answers: number;
  ownershipClaims: {
    total: number;
    verified: number;
    pending: number;
    rejected: number;
    revoked: number;
  };
  reports: { total: number; open: number };
  events: { total: number; byName: Record<string, number> };
  /** commerce_handoff_clicked events — the v0 commerce intent signal. */
  handoffs: number;
  /** Share of claims that reached a verified state (0..1). */
  verificationPassRate: number;
  adminActions: number;
}

/** Funnel + quality metrics summary for the admin metrics view. */
export async function metricsSummary(
  ctx: WebRepositoryContext,
): Promise<ApiResult<MetricsSummaryResponse>> {
  const [products, questions, answers, claims, reports, events, adminActions] = await Promise.all([
    ctx.products.listAll(),
    ctx.questions.listAll(),
    ctx.answers.listAll(),
    ctx.ownershipClaims.listAll(),
    ctx.reports.listAll(),
    ctx.analyticsEvents.list(),
    ctx.adminActions.listAll(),
  ]);

  const claimCounts = { total: claims.length, verified: 0, pending: 0, rejected: 0, revoked: 0 };
  for (const c of claims) claimCounts[c.status] += 1;

  const byName: Record<string, number> = {};
  for (const e of events) byName[e.name] = (byName[e.name] ?? 0) + 1;

  return {
    products: products.length,
    questions: questions.length,
    answers: answers.length,
    ownershipClaims: claimCounts,
    reports: { total: reports.length, open: reports.filter((r) => r.status === "open").length },
    events: { total: events.length, byName },
    handoffs: byName["commerce_handoff_clicked"] ?? 0,
    verificationPassRate: claims.length === 0 ? 0 : claimCounts.verified / claims.length,
    adminActions: adminActions.length,
  };
}

export { isApiError };
