/**
 * API request/response DTO contracts for the v0 prototype.
 *
 * Endpoint list: docs/09-mvp-implementation-spec.md section 5 (API endpoints)
 * and docs/04-architecture-data-and-apis.md (REST). Shapes are prototype-level and
 * may be refined by the web/API agent.
 */

import type {
  Answer,
  CanonicalProduct,
  MinimalOwnershipEvidence,
  OwnershipClaim,
  OwnershipClaimStatus,
  Question,
  ReportTargetType,
} from "./types";

/** Standard machine-readable error envelope. */
export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId?: string;
  };
}

export type ApiErrorCode =
  | "OWNERSHIP_REQUIRED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ApiResult<T> = T | ApiError;

// POST /api/products/resolve
export interface ResolveProductRequest {
  asin: string;
  parentAsin?: string;
  title?: string;
  marketplace?: "US";
}
export interface ResolveProductResponse {
  canonicalProductId: string;
  title: string;
  provisional: boolean;
  confidence: number;
}

// POST /api/questions
export interface CreateQuestionRequest {
  canonicalProductId: string;
  body: string;
}
export type CreateQuestionResponse = Question;

// GET /api/products/:id/questions
export interface ProductQuestionsResponse {
  product: CanonicalProduct;
  questions: Array<Question & { answers: Answer[] }>;
}

// POST /api/answers  (requires verified ownership claim)
export interface CreateAnswerRequest {
  questionId: string;
  body: string;
}
export type CreateAnswerResponse = Answer;

// POST /api/ownership/claims
export type SubmitOwnershipEvidenceRequest = MinimalOwnershipEvidence;
export interface SubmitOwnershipEvidenceResponse {
  claimId: string;
  status: OwnershipClaimStatus;
}

// GET /api/ownership/claims/:id
export type OwnershipClaimStatusResponse = Pick<
  OwnershipClaim,
  "id" | "status" | "confidence" | "canonicalProductId"
>;

// POST /api/feedback/helpful
export interface HelpfulFeedbackRequest {
  answerId: string;
  helpful: boolean;
}

// POST /api/reports
export interface CreateReportRequest {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
}
