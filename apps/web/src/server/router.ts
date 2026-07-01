/**
 * Lightweight request router for the v0 prototype API.
 *
 * Maps HTTP method + path to the domain handlers so the same handlers can be exercised by
 * integration tests and by an optional dev-server adapter (`devServer.ts`). The Next.js
 * target replaces this file with file-based route handlers calling the same functions.
 */

import type { ApiError, ApiResult } from "@owners/shared";
import type { WebRepositoryContext } from "./context";
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
import {
  decideVerification,
  mergeProducts,
  metricsSummary,
  moderateContent,
} from "./admin";

export interface ApiRequest {
  method: string;
  path: string;
  body?: unknown;
  /** Authenticated principal id (from session/header); defaults to "anonymous". */
  principalId?: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

const ERROR_STATUS: Record<ApiError["error"]["code"], number> = {
  OWNERSHIP_REQUIRED: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

function notFound(): ApiResponse {
  return { status: 404, body: { error: { code: "NOT_FOUND", message: "No such route." } } };
}

function toResponse<T>(result: ApiResult<T>, okStatus = 200): ApiResponse {
  if (isApiError(result)) {
    return { status: ERROR_STATUS[result.error.code] ?? 500, body: result };
  }
  return { status: okStatus, body: result };
}

/**
 * Dispatch a single API request against the repository context. Returns an HTTP-ish
 * `{ status, body }` pair. `body` is assumed to be already-parsed JSON (or undefined).
 */
export async function handleApiRequest(
  ctx: WebRepositoryContext,
  req: ApiRequest,
): Promise<ApiResponse> {
  const method = req.method.toUpperCase();
  const path = req.path.split("?")[0]!.replace(/\/+$/, "") || "/";
  const principalId = req.principalId ?? "anonymous";
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Static routes first.
  if (method === "POST" && path === "/api/products/resolve") {
    return toResponse(await resolveProduct(ctx, body as never), 201);
  }
  if (method === "POST" && path === "/api/questions") {
    return toResponse(await createQuestion(ctx, principalId, body as never), 201);
  }
  if (method === "POST" && path === "/api/answers") {
    return toResponse(await createAnswer(ctx, principalId, body as never), 201);
  }
  if (method === "POST" && path === "/api/ownership/claims") {
    return toResponse(await submitOwnershipClaim(ctx, principalId, body as never), 201);
  }
  if (method === "POST" && path === "/api/feedback/helpful") {
    return toResponse(await markHelpful(ctx, principalId, body as never));
  }
  if (method === "POST" && path === "/api/reports") {
    return toResponse(await createReport(ctx, principalId, body as never), 201);
  }
  if (method === "POST" && path === "/api/events") {
    return toResponse(await recordEvent(ctx, body as never), 201);
  }
  if (method === "POST" && path === "/api/admin/products/merge") {
    return toResponse(await mergeProducts(ctx, principalId, body as never));
  }
  if (method === "POST" && path === "/api/admin/verifications/decision") {
    return toResponse(await decideVerification(ctx, principalId, body as never));
  }
  if (method === "POST" && path === "/api/admin/moderation") {
    return toResponse(await moderateContent(ctx, principalId, body as never));
  }
  if (method === "GET" && path === "/api/admin/metrics") {
    return toResponse(await metricsSummary(ctx));
  }

  // Parameterized routes.
  const productQuestions = path.match(/^\/api\/products\/([^/]+)\/questions$/);
  if (method === "GET" && productQuestions) {
    return toResponse(await listProductQuestions(ctx, decodeURIComponent(productQuestions[1]!)));
  }
  const claimStatus = path.match(/^\/api\/ownership\/claims\/([^/]+)$/);
  if (method === "GET" && claimStatus) {
    return toResponse(await getOwnershipClaimStatus(ctx, decodeURIComponent(claimStatus[1]!)));
  }

  return notFound();
}
