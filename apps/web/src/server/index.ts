/**
 * Public surface of the prototype web/API server layer.
 *
 * Consumers (integration tests, the dev-server adapter, and future Next.js route handlers)
 * import handlers and the repository context from here.
 */

export type {
  AnalyticsEventRepository,
  ModerationRepository,
  ModerationTargetType,
  WebAdminActionRepository,
  WebAnswerRepository,
  WebOwnershipClaimRepository,
  WebProductRepository,
  WebQuestionRepository,
  WebReportRepository,
  WebRepositoryContext,
} from "./context";
export { createInMemoryRepositories } from "./memoryRepositories";
export {
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
export type {
  CreateReportResponse,
  EventIngestRequest,
  HelpfulFeedbackResponse,
} from "./handlers";
export {
  decideVerification,
  mergeProducts,
  metricsSummary,
  moderateContent,
} from "./admin";
export type {
  MergeProductsRequest,
  MergeProductsResponse,
  MetricsSummaryResponse,
  ModerationActionRequest,
  ModerationActionResponse,
  VerificationDecisionRequest,
  VerificationDecisionResponse,
} from "./admin";
export { handleApiRequest } from "./router";
export type { ApiRequest, ApiResponse } from "./router";
export { createApiServer, startApiServer } from "./devServer";
