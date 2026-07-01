/**
 * Repository abstractions (ports) for the v0 prototype.
 *
 * These interfaces decouple domain logic from the storage backend. For local E2E the
 * web app provides in-memory implementations; the Vercel/Supabase target swaps in a
 * Postgres-backed adapter without changing callers.
 *
 * NOTE for later agents: keep these interfaces storage-agnostic. Do not leak SQL,
 * Supabase, or HTTP concerns into this file.
 */

import type {
  AdminAction,
  AmazonAsin,
  Answer,
  CanonicalProduct,
  HelpfulVote,
  OwnershipClaim,
  Question,
  Report,
  User,
  UUID,
} from "./types";

export interface UserRepository {
  findById(id: UUID): Promise<User | null>;
  findByHandle(handle: string): Promise<User | null>;
  create(user: User): Promise<User>;
}

export interface ProductRepository {
  findById(id: UUID): Promise<CanonicalProduct | null>;
  findByAsin(asin: string): Promise<{ product: CanonicalProduct; asin: AmazonAsin } | null>;
  create(product: CanonicalProduct): Promise<CanonicalProduct>;
  linkAsin(mapping: AmazonAsin): Promise<AmazonAsin>;
}

export interface OwnershipClaimRepository {
  findById(id: UUID): Promise<OwnershipClaim | null>;
  create(claim: OwnershipClaim): Promise<OwnershipClaim>;
  /** Approved claim for (user, canonicalProduct) — gates verified answering. */
  findVerified(userId: UUID, canonicalProductId: UUID): Promise<OwnershipClaim | null>;
  updateStatus(id: UUID, status: OwnershipClaim["status"]): Promise<OwnershipClaim | null>;
}

export interface QuestionRepository {
  findById(id: UUID): Promise<Question | null>;
  listByProduct(canonicalProductId: UUID): Promise<Question[]>;
  create(question: Question): Promise<Question>;
}

export interface AnswerRepository {
  listByQuestion(questionId: UUID): Promise<Answer[]>;
  create(answer: Answer): Promise<Answer>;
  incrementHelpful(answerId: UUID, delta: number): Promise<Answer | null>;
}

export interface HelpfulVoteRepository {
  create(vote: HelpfulVote): Promise<HelpfulVote>;
  find(answerId: UUID, userId: UUID): Promise<HelpfulVote | null>;
}

export interface ReportRepository {
  create(report: Report): Promise<Report>;
  listOpen(): Promise<Report[]>;
}

export interface AdminActionRepository {
  create(action: AdminAction): Promise<AdminAction>;
}

/** Aggregate of all repositories, injected into API handlers/services. */
export interface RepositoryContext {
  users: UserRepository;
  products: ProductRepository;
  ownershipClaims: OwnershipClaimRepository;
  questions: QuestionRepository;
  answers: AnswerRepository;
  helpfulVotes: HelpfulVoteRepository;
  reports: ReportRepository;
  adminActions: AdminActionRepository;
}
