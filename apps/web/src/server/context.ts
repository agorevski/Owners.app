/**
 * Web-local extended repository context for the v0 prototype API layer.
 *
 * The storage-agnostic ports in `@owners/shared` intentionally model only the minimal
 * surface needed by the core ask -> verify -> answer flow. The prototype web/API layer
 * needs a few additional read/query/mutation capabilities to power the admin console,
 * moderation, metrics, and analytics ingestion described in
 * docs/09-mvp-implementation-spec.md (sections 5, 10, 11).
 *
 * Rather than redesigning the shared domain, these extensions live here and are backed by
 * the in-memory implementation in `memoryRepositories.ts`. The Next.js/Supabase target can
 * implement `WebRepositoryContext` against Postgres without touching `@owners/shared`.
 */

import type {
  AdminAction,
  AdminActionRepository,
  AmazonAsin,
  AnalyticsEvent,
  Answer,
  AnswerRepository,
  CanonicalProduct,
  OwnershipClaim,
  OwnershipClaimRepository,
  ProductRepository,
  Question,
  QuestionRepository,
  Report,
  ReportRepository,
  ReportStatus,
  RepositoryContext,
  UUID,
} from "@owners/shared";

/** Content types that can be hidden/restored by moderation. */
export type ModerationTargetType = "question" | "answer";

/** Persisted analytics events for the funnel + metrics rollups. */
export interface AnalyticsEventRepository {
  record(event: AnalyticsEvent): Promise<AnalyticsEvent>;
  list(): Promise<AnalyticsEvent[]>;
}

/** Tracks hidden content so public reads can exclude moderated items. */
export interface ModerationRepository {
  hide(targetType: ModerationTargetType, targetId: UUID): Promise<void>;
  restore(targetType: ModerationTargetType, targetId: UUID): Promise<void>;
  isHidden(targetType: ModerationTargetType, targetId: UUID): Promise<boolean>;
}

export interface WebProductRepository extends ProductRepository {
  listAll(): Promise<CanonicalProduct[]>;
  listAsinsByProduct(canonicalProductId: UUID): Promise<AmazonAsin[]>;
  /** Move an ASIN mapping to a different canonical product (merge support). */
  relinkAsin(asin: string, toCanonicalProductId: UUID): Promise<AmazonAsin | null>;
  /** Mark a source product as merged into a target (kept for audit, hidden from lists). */
  markMerged(sourceId: UUID, targetId: UUID): Promise<CanonicalProduct | null>;
}

export interface WebQuestionRepository extends QuestionRepository {
  listAll(): Promise<Question[]>;
  updateStatus(id: UUID, status: Question["status"]): Promise<Question | null>;
  /** Reassign questions from a source product to a target product (merge support). */
  reassignProduct(fromCanonicalProductId: UUID, toCanonicalProductId: UUID): Promise<number>;
}

export interface WebAnswerRepository extends AnswerRepository {
  findById(id: UUID): Promise<Answer | null>;
  listAll(): Promise<Answer[]>;
}

export interface WebOwnershipClaimRepository extends OwnershipClaimRepository {
  listAll(): Promise<OwnershipClaim[]>;
}

export interface WebReportRepository extends ReportRepository {
  findById(id: UUID): Promise<Report | null>;
  listAll(): Promise<Report[]>;
  updateStatus(id: UUID, status: ReportStatus): Promise<Report | null>;
}

export interface WebAdminActionRepository extends AdminActionRepository {
  listAll(): Promise<AdminAction[]>;
}

/**
 * Extended context consumed by the prototype API handlers. It is a superset of the shared
 * `RepositoryContext`: every shared port is present (so shared-typed callers keep working)
 * plus the web-only repositories above.
 */
export interface WebRepositoryContext extends RepositoryContext {
  products: WebProductRepository;
  questions: WebQuestionRepository;
  answers: WebAnswerRepository;
  ownershipClaims: WebOwnershipClaimRepository;
  reports: WebReportRepository;
  adminActions: WebAdminActionRepository;
  analyticsEvents: AnalyticsEventRepository;
  moderation: ModerationRepository;
}
