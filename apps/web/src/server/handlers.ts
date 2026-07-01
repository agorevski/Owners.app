import type {
  ApiError,
  ApiResult,
  CreateAnswerRequest,
  CreateAnswerResponse,
  CreateQuestionRequest,
  CreateQuestionResponse,
  RepositoryContext,
  ResolveProductRequest,
  ResolveProductResponse,
} from "@owners/shared";
import { canonicalGroupingKey, isProvisionalResolution, normalizeAsin } from "@owners/shared";

/**
 * Prototype API handlers.
 *
 * These are storage-agnostic domain handlers that operate against a RepositoryContext.
 * In the Vite prototype they can be called directly (in-memory); in the Next.js target
 * they are wrapped by route handlers. Only a representative subset is implemented to
 * establish contracts — later agents should complete the remaining endpoints from
 * docs/09-mvp-implementation-spec.md section 5.
 */

function apiError(code: ApiError["error"]["code"], message: string): ApiError {
  return { error: { code, message } };
}

/** POST /api/products/resolve — resolve an Amazon ASIN into a canonical product. */
export async function resolveProduct(
  ctx: RepositoryContext,
  req: ResolveProductRequest,
): Promise<ApiResult<ResolveProductResponse>> {
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
    createdAt: new Date().toISOString(),
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

/** POST /api/questions — create a shopper question. */
export async function createQuestion(
  ctx: RepositoryContext,
  authorId: string,
  req: CreateQuestionRequest,
): Promise<ApiResult<CreateQuestionResponse>> {
  if (!req.body.trim()) {
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
    createdAt: new Date().toISOString(),
  });
}

/**
 * POST /api/answers — post an owner answer.
 * Enforces the core invariant: the author must hold a VERIFIED ownership claim for the
 * question's canonical product, else 403 OWNERSHIP_REQUIRED.
 */
export async function createAnswer(
  ctx: RepositoryContext,
  authorId: string,
  req: CreateAnswerRequest,
): Promise<ApiResult<CreateAnswerResponse>> {
  if (!req.body.trim()) {
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
  return ctx.answers.create({
    id: crypto.randomUUID(),
    questionId: req.questionId,
    authorId,
    ownershipClaimId: claim.id,
    body: req.body.trim(),
    isAccepted: false,
    helpfulCount: 0,
    createdAt: new Date().toISOString(),
  });
}

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return typeof result === "object" && result !== null && "error" in result;
}
