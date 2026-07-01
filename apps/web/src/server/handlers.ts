/**
 * Prototype API handlers for the v0 Owners.app web/API layer.
 *
 * These are storage-agnostic domain handlers that operate against a `WebRepositoryContext`
 * (a superset of the shared `RepositoryContext`). In the Vite prototype they are called
 * directly (in-memory) from tests and the lightweight dev-server router; in the Next.js
 * target they are wrapped by route handlers with no domain/contract changes.
 *
 * Endpoint list: docs/09-mvp-implementation-spec.md section 5.
 */

import type {
  AnalyticsEvent,
  AnalyticsEventName,
  ApiError,
  ApiResult,
  CreateAnswerRequest,
  CreateAnswerResponse,
  CreateQuestionRequest,
  CreateQuestionResponse,
  CreateReportRequest,
  HelpfulFeedbackRequest,
  OwnershipClaimStatusResponse,
  ProductQuestionsResponse,
  Report,
  ResolveProductRequest,
  ResolveProductResponse,
  SubmitOwnershipEvidenceRequest,
  SubmitOwnershipEvidenceResponse,
} from "@owners/shared";
import {
  ANALYTICS_EVENT_NAMES,
  canonicalGroupingKey,
  isProvisionalResolution,
  isValidAsin,
  normalizeAsin,
} from "@owners/shared";
import type { WebRepositoryContext } from "./context";

/** Confidence at/above which an ownership claim auto-verifies; below routes to admin review. */
const AUTO_VERIFY_CONFIDENCE = 0.8;

function apiError(code: ApiError["error"]["code"], message: string): ApiError {
  return { error: { code, message } };
}

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return typeof result === "object" && result !== null && "error" in result;
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** POST /api/products/resolve — resolve an Amazon ASIN into a canonical product. */
export async function resolveProduct(
  ctx: WebRepositoryContext,
  req: ResolveProductRequest,
): Promise<ApiResult<ResolveProductResponse>> {
  if (!req.asin || !isValidAsin(req.asin)) {
    return apiError("VALIDATION_ERROR", "A valid 10-character Amazon ASIN is required.");
  }
  if (req.parentAsin && !isValidAsin(req.parentAsin)) {
    return apiError("VALIDATION_ERROR", "parentAsin must be a valid Amazon ASIN when provided.");
  }

  const asin = normalizeAsin(req.asin);
  const existing = await ctx.products.findByAsin(asin);
  if (existing) {
    return {
      canonicalProductId: existing.product.id,
      title: existing.product.title,
      provisional: existing.product.provisional,
      confidence: existing.product.provisional ? 0.5 : 0.9,
    };
  }

  const provisional = isProvisionalResolution(req.parentAsin);
  const product = await ctx.products.create({
    id: crypto.randomUUID(),
    title: req.title ?? `Amazon product ${asin}`,
    provisional,
    createdAt: now(),
  });
  await ctx.products.linkAsin({
    asin,
    parentAsin: req.parentAsin ? normalizeAsin(req.parentAsin) : undefined,
    canonicalProductId: product.id,
    marketplace: req.marketplace ?? "US",
  });

  // canonicalGroupingKey is used by the merge queue to cluster provisional products.
  void canonicalGroupingKey(asin, req.parentAsin);

  return {
    canonicalProductId: product.id,
    title: product.title,
    provisional,
    confidence: provisional ? 0.5 : 0.9,
  };
}

/** GET /api/products/:id/questions — list Q&A for a canonical product (excludes hidden). */
export async function listProductQuestions(
  ctx: WebRepositoryContext,
  canonicalProductId: string,
): Promise<ApiResult<ProductQuestionsResponse>> {
  const product = await ctx.products.findById(canonicalProductId);
  if (!product) {
    return apiError("NOT_FOUND", "Canonical product not found.");
  }

  const questions = await ctx.questions.listByProduct(canonicalProductId);
  const visible: ProductQuestionsResponse["questions"] = [];
  for (const question of questions) {
    if (await ctx.moderation.isHidden("question", question.id)) continue;
    const answers = await ctx.answers.listByQuestion(question.id);
    const visibleAnswers = [];
    for (const answer of answers) {
      if (await ctx.moderation.isHidden("answer", answer.id)) continue;
      visibleAnswers.push(answer);
    }
    visible.push({ ...question, answers: visibleAnswers });
  }

  return { product, questions: visible };
}

// ---------------------------------------------------------------------------
// Questions & answers
// ---------------------------------------------------------------------------

/** POST /api/questions — create a shopper question. */
export async function createQuestion(
  ctx: WebRepositoryContext,
  authorId: string,
  req: CreateQuestionRequest,
): Promise<ApiResult<CreateQuestionResponse>> {
  if (!req.body || !req.body.trim()) {
    return apiError("VALIDATION_ERROR", "Question body is required.");
  }
  const product = await ctx.products.findById(req.canonicalProductId);
  if (!product) {
    return apiError("NOT_FOUND", "Canonical product not found.");
  }
  return ctx.questions.create({
    id: crypto.randomUUID(),
    canonicalProductId: req.canonicalProductId,
    authorId,
    body: req.body.trim(),
    status: "open",
    createdAt: now(),
  });
}

/**
 * POST /api/answers — post an owner answer.
 * Enforces the core invariant: the author must hold a VERIFIED ownership claim for the
 * question's canonical product, else 403 OWNERSHIP_REQUIRED. A pending, rejected, revoked,
 * or wrong-product claim does not satisfy this.
 */
export async function createAnswer(
  ctx: WebRepositoryContext,
  authorId: string,
  req: CreateAnswerRequest,
): Promise<ApiResult<CreateAnswerResponse>> {
  if (!req.body || !req.body.trim()) {
    return apiError("VALIDATION_ERROR", "Answer body is required.");
  }
  const question = await ctx.questions.findById(req.questionId);
  if (!question) {
    return apiError("NOT_FOUND", "Question not found.");
  }
  const claim = await ctx.ownershipClaims.findVerified(authorId, question.canonicalProductId);
  if (!claim) {
    return apiError("OWNERSHIP_REQUIRED", "Verified ownership needed to answer.");
  }
  const answer = await ctx.answers.create({
    id: crypto.randomUUID(),
    questionId: req.questionId,
    authorId,
    ownershipClaimId: claim.id,
    body: req.body.trim(),
    isAccepted: false,
    helpfulCount: 0,
    createdAt: now(),
  });
  // Posting an answer transitions an open question to answered.
  if (question.status === "open") {
    await ctx.questions.updateStatus(question.id, "answered");
  }
  return answer;
}

// ---------------------------------------------------------------------------
// Ownership claims
// ---------------------------------------------------------------------------

/**
 * POST /api/ownership/claims — submit minimal Amazon Orders verification evidence.
 *
 * Resolves the evidence ASIN to a canonical product, then creates a claim. A confident
 * (parent/variation-backed) match auto-verifies; an exact-ASIN-only match stays `pending`
 * and is routed to the admin verification queue (spec section 3).
 */
export async function submitOwnershipClaim(
  ctx: WebRepositoryContext,
  userId: string,
  req: SubmitOwnershipEvidenceRequest,
): Promise<ApiResult<SubmitOwnershipEvidenceResponse>> {
  if (!req.asin || !isValidAsin(req.asin)) {
    return apiError("VALIDATION_ERROR", "A valid Amazon ASIN is required in the evidence payload.");
  }
  if (req.parentAsin && !isValidAsin(req.parentAsin)) {
    return apiError("VALIDATION_ERROR", "parentAsin must be a valid Amazon ASIN when provided.");
  }
  if (req.retailer !== "amazon" || req.marketplace !== "US") {
    return apiError("VALIDATION_ERROR", "v0 supports only the Amazon.com (US) marketplace.");
  }

  const resolved = await resolveProduct(ctx, {
    asin: req.asin,
    parentAsin: req.parentAsin,
    marketplace: "US",
  });
  if (isApiError(resolved)) return resolved;

  const confident = !isProvisionalResolution(req.parentAsin);
  const confidence = confident ? 0.9 : 0.5;
  const status = confidence >= AUTO_VERIFY_CONFIDENCE ? "verified" : "pending";

  const claim = await ctx.ownershipClaims.create({
    id: crypto.randomUUID(),
    userId,
    canonicalProductId: resolved.canonicalProductId,
    method: req.verificationMethod,
    status,
    confidence,
    asin: normalizeAsin(req.asin),
    parentAsin: req.parentAsin ? normalizeAsin(req.parentAsin) : undefined,
    purchaseMonth: req.purchaseMonth,
    hashedOrderId: req.hashedOrderId,
    verifiedAt: status === "verified" ? now() : undefined,
    createdAt: now(),
  });

  return { claimId: claim.id, status: claim.status };
}

/** GET /api/ownership/claims/:id — check claim status. */
export async function getOwnershipClaimStatus(
  ctx: WebRepositoryContext,
  claimId: string,
): Promise<ApiResult<OwnershipClaimStatusResponse>> {
  const claim = await ctx.ownershipClaims.findById(claimId);
  if (!claim) {
    return apiError("NOT_FOUND", "Ownership claim not found.");
  }
  // Never expose raw evidence (hashed order id, etc.) — only lifecycle status.
  return {
    id: claim.id,
    status: claim.status,
    confidence: claim.confidence,
    canonicalProductId: claim.canonicalProductId,
  };
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export interface HelpfulFeedbackResponse {
  answerId: string;
  helpfulCount: number;
  /** True if this call changed the recorded vote (new vote or flipped value). */
  recorded: boolean;
}

/**
 * POST /api/feedback/helpful — mark an answer helpful / not helpful.
 *
 * One vote per (answer, user): a repeated identical vote is idempotent (no double count);
 * flipping the vote adjusts the helpful count accordingly.
 */
export async function markHelpful(
  ctx: WebRepositoryContext,
  userId: string,
  req: HelpfulFeedbackRequest,
): Promise<ApiResult<HelpfulFeedbackResponse>> {
  const answer = await ctx.answers.findById(req.answerId);
  if (!answer) {
    return apiError("NOT_FOUND", "Answer not found.");
  }

  const existing = await ctx.helpfulVotes.find(req.answerId, userId);
  if (existing && existing.helpful === req.helpful) {
    // Idempotent: identical vote already recorded.
    return { answerId: req.answerId, helpfulCount: answer.helpfulCount, recorded: false };
  }

  await ctx.helpfulVotes.create({
    id: existing?.id ?? crypto.randomUUID(),
    answerId: req.answerId,
    userId,
    helpful: req.helpful,
    createdAt: now(),
  });

  let delta = 0;
  if (!existing) {
    delta = req.helpful ? 1 : 0;
  } else {
    // Flipped vote: from not-helpful->helpful adds one; helpful->not-helpful removes one.
    delta = req.helpful ? 1 : -1;
  }

  const updated = delta !== 0 ? await ctx.answers.incrementHelpful(req.answerId, delta) : answer;
  return {
    answerId: req.answerId,
    helpfulCount: updated?.helpfulCount ?? answer.helpfulCount,
    recorded: true,
  };
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type CreateReportResponse = Report;

/** POST /api/reports — report a question, answer, or profile into the moderation queue. */
export async function createReport(
  ctx: WebRepositoryContext,
  reporterId: string,
  req: CreateReportRequest,
): Promise<ApiResult<CreateReportResponse>> {
  if (!req.reason || !req.reason.trim()) {
    return apiError("VALIDATION_ERROR", "A report reason is required.");
  }
  if (req.targetType !== "question" && req.targetType !== "answer" && req.targetType !== "user") {
    return apiError("VALIDATION_ERROR", "Unsupported report target type.");
  }
  if (!req.targetId) {
    return apiError("VALIDATION_ERROR", "A report target id is required.");
  }

  return ctx.reports.create({
    id: crypto.randomUUID(),
    targetType: req.targetType,
    targetId: req.targetId,
    reporterId,
    reason: req.reason.trim(),
    status: "open",
    createdAt: now(),
  });
}

// ---------------------------------------------------------------------------
// Analytics events
// ---------------------------------------------------------------------------

export interface EventIngestRequest {
  name: AnalyticsEventName;
  principalId?: string;
  props?: Record<string, string | number | boolean | null>;
  occurredAt?: string;
}

const ANALYTICS_EVENT_NAME_SET = new Set<string>(ANALYTICS_EVENT_NAMES);

/** Keys that could smuggle an affiliate tag into a commerce handoff event. */
const AFFILIATE_KEY_PATTERN = /(^|_|-)?(affiliate|associate)?(tag|tracking_id)$/i;

/**
 * Enforce the v0 no-affiliate-tag commerce posture: strip any affiliate tag identifiers
 * from event properties (both dedicated tag keys and `tag=` query params on URL-like values).
 */
function stripAffiliateTag(
  props: EventIngestRequest["props"],
): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  if (!props) return clean;
  for (const [key, value] of Object.entries(props)) {
    if (AFFILIATE_KEY_PATTERN.test(key)) continue;
    if (typeof value === "string" && value.includes("tag=")) {
      // Remove any tag query parameter while preserving the rest of the URL/string.
      clean[key] = value
        .replace(/([?&])tag=[^&#]*/gi, "$1")
        .replace(/[?&]$/, "")
        .replace(/([?&])&+/g, "$1");
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

/** POST /api/events — analytics event ingestion for the MVP funnel. */
export async function recordEvent(
  ctx: WebRepositoryContext,
  req: EventIngestRequest,
): Promise<ApiResult<AnalyticsEvent>> {
  if (!req.name || !ANALYTICS_EVENT_NAME_SET.has(req.name)) {
    return apiError("VALIDATION_ERROR", "Unknown analytics event name.");
  }

  const event: AnalyticsEvent = {
    name: req.name,
    principalId: req.principalId,
    // The commerce handoff must never carry an affiliate tag in v0.
    props: stripAffiliateTag(req.props),
    occurredAt: req.occurredAt ?? now(),
  };
  return ctx.analyticsEvents.record(event);
}
