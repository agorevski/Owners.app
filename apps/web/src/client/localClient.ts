/**
 * In-browser API client for the v0 web prototype.
 *
 * The Vite prototype runs fully client-side: this client dispatches the same JSON contracts
 * documented in docs/09 section 5 against an in-memory `WebRepositoryContext` using the
 * reference `handleApiRequest` router. Mutations therefore go through the exact same domain
 * handlers exercised by the server tests (so the ownership invariant, affiliate-tag
 * stripping, and moderation rules are preserved).
 *
 * A handful of read-only "view" helpers query the in-memory context directly. These power
 * the owner dashboard and admin queues, which have no dedicated HTTP endpoint in v0. They
 * are prototype conveniences only and do not change any server handler contract; the
 * Next.js/Supabase target would back them with real queries or endpoints.
 */

import type {
  Answer,
  ApiError,
  CanonicalProduct,
  CreateQuestionRequest,
  CreateReportRequest,
  OwnershipClaim,
  ProductQuestionsResponse,
  Question,
  Report,
  ResolveProductRequest,
  ResolveProductResponse,
  SubmitOwnershipEvidenceRequest,
  SubmitOwnershipEvidenceResponse,
  OwnershipClaimStatusResponse,
  User,
} from "@owners/shared";
import type {
  MergeProductsResponse,
  MetricsSummaryResponse,
  ModerationActionResponse,
  VerificationDecisionResponse,
} from "../server/admin";
import type { WebRepositoryContext } from "../server/context";
import { createInMemoryRepositories } from "../server/memoryRepositories";
import { handleApiRequest } from "../server/router";

/** Error thrown by the client when the API returns an error envelope. */
export class ApiClientError extends Error {
  readonly code: ApiError["error"]["code"];
  constructor(code: ApiError["error"]["code"], message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

function isErrorBody(body: unknown): body is ApiError {
  return typeof body === "object" && body !== null && "error" in body;
}

// ---------------------------------------------------------------------------
// View-model types (enriched for rendering)
// ---------------------------------------------------------------------------

export type AnswerProvenance = "verified-owner";

export interface AnswerView extends Answer {
  authorHandle: string;
  provenance: AnswerProvenance;
  /** Claim status at render time (historical answers keep an accurate status label). */
  claimStatus: OwnershipClaim["status"] | "unknown";
}

export interface QuestionView extends Question {
  authorHandle: string;
  answers: AnswerView[];
}

export interface ProductView {
  product: CanonicalProduct;
  questions: QuestionView[];
  verifiedOwnerCount: number;
  lastUpdate?: string;
  /** First mapped ASIN — used to build the disclosed, tag-free Amazon handoff URL. */
  primaryAsin?: string;
}

export interface PendingClaimView {
  claim: OwnershipClaim;
  productTitle: string;
  ownerHandle: string;
}

export interface ReportView {
  report: Report;
  targetPreview: string;
  hidden: boolean;
}

export interface OwnerVerifiedProduct {
  product: CanonicalProduct;
  claim: OwnershipClaim;
}

export interface OwnerDashboardView {
  handle: string;
  verifiedProducts: OwnerVerifiedProduct[];
  pendingClaims: OwnershipClaim[];
  /** Open questions on products the owner has verified — the routed inbox. */
  routedQuestions: Array<{ question: Question; productTitle: string }>;
  answersGiven: number;
  helpfulReceived: number;
  /** True when this owner has the most helpful votes in the beta category. */
  isTopHelper: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class LocalApiClient {
  readonly ctx: WebRepositoryContext;
  private principalId = "anonymous";

  constructor(ctx: WebRepositoryContext = createInMemoryRepositories()) {
    this.ctx = ctx;
  }

  /** Set the authenticated principal (user id) used for authored/owned mutations. */
  setPrincipal(principalId: string): void {
    this.principalId = principalId || "anonymous";
  }

  private async dispatch<T>(
    method: string,
    path: string,
    body?: unknown,
    okStatuses: number[] = [200, 201],
  ): Promise<T> {
    const res = await handleApiRequest(this.ctx, {
      method,
      path,
      body,
      principalId: this.principalId,
    });
    if (isErrorBody(res.body)) {
      throw new ApiClientError(res.body.error.code, res.body.error.message);
    }
    if (!okStatuses.includes(res.status)) {
      throw new ApiClientError("INTERNAL", `Unexpected status ${res.status} for ${path}`);
    }
    return res.body as T;
  }

  // --- Endpoint methods (docs/09 section 5) -------------------------------

  resolveProduct(req: ResolveProductRequest): Promise<ResolveProductResponse> {
    return this.dispatch("POST", "/api/products/resolve", req);
  }

  listQuestions(canonicalProductId: string): Promise<ProductQuestionsResponse> {
    return this.dispatch("GET", `/api/products/${encodeURIComponent(canonicalProductId)}/questions`);
  }

  createQuestion(req: CreateQuestionRequest): Promise<Question> {
    return this.dispatch("POST", "/api/questions", req);
  }

  createAnswer(req: { questionId: string; body: string }): Promise<Answer> {
    return this.dispatch("POST", "/api/answers", req);
  }

  submitOwnershipClaim(
    req: SubmitOwnershipEvidenceRequest,
  ): Promise<SubmitOwnershipEvidenceResponse> {
    return this.dispatch("POST", "/api/ownership/claims", req);
  }

  getClaimStatus(claimId: string): Promise<OwnershipClaimStatusResponse> {
    return this.dispatch("GET", `/api/ownership/claims/${encodeURIComponent(claimId)}`);
  }

  markHelpful(
    answerId: string,
    helpful: boolean,
  ): Promise<{ answerId: string; helpfulCount: number }> {
    return this.dispatch("POST", "/api/feedback/helpful", { answerId, helpful });
  }

  createReport(req: CreateReportRequest): Promise<Report> {
    return this.dispatch("POST", "/api/reports", req);
  }

  recordEvent(
    name: string,
    props?: Record<string, string | number | boolean | null>,
  ): Promise<unknown> {
    return this.dispatch("POST", "/api/events", { name, props });
  }

  // --- Admin endpoints (docs/09 section 10) -------------------------------

  mergeProducts(
    sourceProductId: string,
    targetProductId: string,
    reason?: string,
  ): Promise<MergeProductsResponse> {
    return this.dispatch("POST", "/api/admin/products/merge", {
      sourceProductId,
      targetProductId,
      reason,
    });
  }

  decideVerification(
    claimId: string,
    decision: "approve" | "reject",
    reason?: string,
  ): Promise<VerificationDecisionResponse> {
    return this.dispatch("POST", "/api/admin/verifications/decision", { claimId, decision, reason });
  }

  moderate(
    targetType: "question" | "answer",
    targetId: string,
    action: "hide" | "restore",
    reportId?: string,
    reason?: string,
  ): Promise<ModerationActionResponse> {
    return this.dispatch("POST", "/api/admin/moderation", {
      targetType,
      targetId,
      action,
      reportId,
      reason,
    });
  }

  metrics(): Promise<MetricsSummaryResponse> {
    return this.dispatch("GET", "/api/admin/metrics");
  }

  // --- Read-only view helpers (prototype-only; back the dashboard/admin) ---

  private async handleOf(userId: string): Promise<string> {
    const user = await this.ctx.users.findById(userId);
    return user?.handle ?? "anonymous";
  }

  /** Enriched product Q&A view including provenance, handles, and provenance summary. */
  async getProductView(canonicalProductId: string): Promise<ProductView | null> {
    const res = await handleApiRequest(this.ctx, {
      method: "GET",
      path: `/api/products/${encodeURIComponent(canonicalProductId)}/questions`,
      principalId: this.principalId,
    });
    if (isErrorBody(res.body)) return null;
    const data = res.body as ProductQuestionsResponse;
    const claims = await this.ctx.ownershipClaims.listAll();

    const questions: QuestionView[] = [];
    let lastUpdate: string | undefined;
    for (const q of data.questions) {
      const answers: AnswerView[] = [];
      for (const a of q.answers) {
        const claim = claims.find((c) => c.id === a.ownershipClaimId);
        answers.push({
          ...a,
          authorHandle: await this.handleOf(a.authorId),
          provenance: "verified-owner",
          claimStatus: claim?.status ?? "unknown",
        });
        if (!lastUpdate || a.createdAt > lastUpdate) lastUpdate = a.createdAt;
      }
      if (!lastUpdate || q.createdAt > lastUpdate) lastUpdate = q.createdAt;
      questions.push({ ...q, authorHandle: await this.handleOf(q.authorId), answers });
    }

    const verifiedOwners = new Set(
      claims
        .filter((c) => c.canonicalProductId === canonicalProductId && c.status === "verified")
        .map((c) => c.userId),
    );

    const asins = await this.ctx.products.listAsinsByProduct(canonicalProductId);

    return {
      product: data.product,
      questions,
      verifiedOwnerCount: verifiedOwners.size,
      lastUpdate,
      primaryAsin: asins[0]?.asin,
    };
  }

  /** Products still flagged provisional — candidates for the admin merge queue. */
  async listProvisionalProducts(): Promise<CanonicalProduct[]> {
    const products = await this.ctx.products.listAll();
    return products.filter((p) => p.provisional);
  }

  /** All non-merged canonical products (merge targets, admin listings). */
  listAllProducts(): Promise<CanonicalProduct[]> {
    return this.ctx.products.listAll();
  }

  /** Ambiguous ownership claims awaiting an admin decision. */
  async listPendingClaims(): Promise<PendingClaimView[]> {
    const claims = await this.ctx.ownershipClaims.listAll();
    const pending = claims.filter((c) => c.status === "pending");
    const views: PendingClaimView[] = [];
    for (const claim of pending) {
      const product = await this.ctx.products.findById(claim.canonicalProductId);
      views.push({
        claim,
        productTitle: product?.title ?? claim.canonicalProductId,
        ownerHandle: await this.handleOf(claim.userId),
      });
    }
    return views;
  }

  /** Open reports for the moderation queue, with a short target preview. */
  async listOpenReports(): Promise<ReportView[]> {
    const reports = await this.ctx.reports.listOpen();
    const views: ReportView[] = [];
    for (const report of reports) {
      let targetPreview = report.targetId;
      let hidden = false;
      if (report.targetType === "question") {
        const q = await this.ctx.questions.findById(report.targetId);
        targetPreview = q?.body ?? report.targetId;
        hidden = await this.ctx.moderation.isHidden("question", report.targetId);
      } else if (report.targetType === "answer") {
        const a = await this.ctx.answers.findById(report.targetId);
        targetPreview = a?.body ?? report.targetId;
        hidden = await this.ctx.moderation.isHidden("answer", report.targetId);
      }
      views.push({ report, targetPreview, hidden });
    }
    return views;
  }

  /** True when a user holds a verified ownership claim for a product. */
  async hasVerifiedOwnership(userId: string, canonicalProductId: string): Promise<boolean> {
    const claim = await this.ctx.ownershipClaims.findVerified(userId, canonicalProductId);
    return claim !== null;
  }

  /** Recognition-only owner dashboard (no cash earnings — docs/09 section 8, AC-DB1). */
  async getOwnerDashboard(userId: string): Promise<OwnerDashboardView> {
    const [claims, answers, questions] = await Promise.all([
      this.ctx.ownershipClaims.listAll(),
      this.ctx.answers.listAll(),
      this.ctx.questions.listAll(),
    ]);

    const myClaims = claims.filter((c) => c.userId === userId);
    const verifiedProducts: OwnerVerifiedProduct[] = [];
    for (const claim of myClaims.filter((c) => c.status === "verified")) {
      const product = await this.ctx.products.findById(claim.canonicalProductId);
      if (product) verifiedProducts.push({ product, claim });
    }
    const verifiedProductIds = new Set(verifiedProducts.map((p) => p.product.id));

    const myAnswers = answers.filter((a) => a.authorId === userId);
    const helpfulReceived = myAnswers.reduce((sum, a) => sum + a.helpfulCount, 0);

    const routedQuestions = questions
      .filter((q) => q.status === "open" && verifiedProductIds.has(q.canonicalProductId))
      .map((q) => ({
        question: q,
        productTitle: verifiedProducts.find((p) => p.product.id === q.canonicalProductId)!.product
          .title,
      }));

    // "Top helper": most helpful votes received across all owners in the beta category.
    const helpfulByUser = new Map<string, number>();
    for (const a of answers) {
      helpfulByUser.set(a.authorId, (helpfulByUser.get(a.authorId) ?? 0) + a.helpfulCount);
    }
    const maxHelpful = Math.max(0, ...helpfulByUser.values());
    const isTopHelper = helpfulReceived > 0 && helpfulReceived === maxHelpful;

    return {
      handle: await this.handleOf(userId),
      verifiedProducts,
      pendingClaims: myClaims.filter((c) => c.status === "pending"),
      routedQuestions,
      answersGiven: myAnswers.length,
      helpfulReceived,
      isTopHelper,
    };
  }

  getUser(userId: string): Promise<User | null> {
    return this.ctx.users.findById(userId);
  }
}
