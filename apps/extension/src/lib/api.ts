/**
 * Owners.app API client used by the service worker.
 *
 * Implements the v0 endpoint contracts from docs/09 section 5. The client is transport-only:
 * it never inspects Amazon page DOM and only sends the minimized payloads it is given.
 *
 * Web/API assumption (documented): the Next.js/Vite app exposes these JSON endpoints under
 * a configurable base (default http://localhost:5173/api), each accepting/returning the DTOs
 * declared in @owners/shared. See apps/web/src/server/handlers.ts for the reference impl.
 */

import type {
  AnalyticsEventName,
  CreateAnswerRequest,
  CreateAnswerResponse,
  CreateQuestionRequest,
  CreateQuestionResponse,
  CreateReportRequest,
  HelpfulFeedbackRequest,
  OwnershipClaimStatusResponse,
  ProductQuestionsResponse,
  ResolveProductRequest,
  ResolveProductResponse,
  SubmitOwnershipEvidenceRequest,
  SubmitOwnershipEvidenceResponse,
} from "@owners/shared";

export const DEFAULT_API_BASE = "http://localhost:5173/api";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
  /** Optional bearer token (email magic-link session) added to authenticated calls. */
  getAuthToken?: () => string | undefined;
}

export class OwnersApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly getAuthToken?: () => string | undefined;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE).replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.getAuthToken = options.getAuthToken;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const token = this.getAuthToken?.();
    if (token) headers["authorization"] = `Bearer ${token}`;
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      throw new Error(`Owners.app API ${path} failed: ${res.status}`);
    }
    return (await res.json()) as T;
  }

  // POST /api/products/resolve
  resolveProduct(req: ResolveProductRequest): Promise<ResolveProductResponse> {
    return this.request("/products/resolve", { method: "POST", body: JSON.stringify(req) });
  }

  // GET /api/products/:id/questions
  listQuestions(canonicalProductId: string): Promise<ProductQuestionsResponse> {
    return this.request(`/products/${encodeURIComponent(canonicalProductId)}/questions`);
  }

  // POST /api/questions
  createQuestion(req: CreateQuestionRequest): Promise<CreateQuestionResponse> {
    return this.request("/questions", { method: "POST", body: JSON.stringify(req) });
  }

  // POST /api/answers (requires verified ownership claim)
  createAnswer(req: CreateAnswerRequest): Promise<CreateAnswerResponse> {
    return this.request("/answers", { method: "POST", body: JSON.stringify(req) });
  }

  // POST /api/ownership/claims
  submitOwnershipEvidence(
    req: SubmitOwnershipEvidenceRequest,
  ): Promise<SubmitOwnershipEvidenceResponse> {
    return this.request("/ownership/claims", { method: "POST", body: JSON.stringify(req) });
  }

  // GET /api/ownership/claims/:id
  getClaimStatus(claimId: string): Promise<OwnershipClaimStatusResponse> {
    return this.request(`/ownership/claims/${encodeURIComponent(claimId)}`);
  }

  // POST /api/feedback/helpful
  markHelpful(req: HelpfulFeedbackRequest): Promise<{ ok: true }> {
    return this.request("/feedback/helpful", { method: "POST", body: JSON.stringify(req) });
  }

  // POST /api/reports
  createReport(req: CreateReportRequest): Promise<{ ok: true }> {
    return this.request("/reports", { method: "POST", body: JSON.stringify(req) });
  }

  // POST /api/events
  postEvent(
    name: AnalyticsEventName,
    props?: Record<string, string | number | boolean | null>,
  ): Promise<{ ok: true }> {
    return this.request("/events", {
      method: "POST",
      body: JSON.stringify({ name, props, occurredAt: new Date().toISOString() }),
    });
  }
}
