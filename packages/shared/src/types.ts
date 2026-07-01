/**
 * Owners.app v0 domain types.
 *
 * Source of truth: docs/09-mvp-implementation-spec.md (section 6 — v0 relational data model)
 * and docs/04-architecture-data-and-apis.md (Relational Schema).
 *
 * These are prototype-level types for the local E2E build. They intentionally model the
 * MVP cut-line (Amazon.com earbuds, Chrome MV3, recognition-only rewards) and defer
 * AI/graph/vector/commerce-payout concerns.
 */

/** Opaque UUID string. Kept as a nominal-ish alias for readability. */
export type UUID = string;

/** ISO-8601 timestamp string, e.g. "2026-06-30T00:00:00Z". */
export type ISODateTime = string;

/** "YYYY-MM" month string used for the longevity signal without exact-date exposure. */
export type YearMonth = string;

export type UserRole = "shopper" | "owner" | "moderator" | "admin";

export type OwnershipClaimStatus = "pending" | "verified" | "rejected" | "revoked";

/** v0 verification method is a user-initiated Amazon Orders scan. Others are target-state. */
export type VerificationMethod =
  | "amazon_orders_user_initiated_scan"
  | "receipt"
  | "retailer_link"
  | "serial"
  | "photo"
  | "attestation";

export type QuestionStatus = "open" | "answered" | "closed" | "hidden";

export type ReportStatus = "open" | "actioned" | "dismissed";

export type Marketplace = "US";

export type Retailer = "amazon";

export interface User {
  id: UUID;
  /** Pseudonymous public handle. Never expose real name or order details. */
  handle: string;
  email?: string;
  displayName?: string;
  roles: UserRole[];
  createdAt: ISODateTime;
}

/** Earbud product grouped across Amazon variants (parent/variation aware). */
export interface CanonicalProduct {
  id: UUID;
  title: string;
  manufacturer?: string;
  modelNumber?: string;
  /** True until an admin confirms/merges a provisional exact-ASIN product. */
  provisional: boolean;
  createdAt: ISODateTime;
}

export interface AmazonAsin {
  asin: string;
  parentAsin?: string;
  canonicalProductId: UUID;
  marketplace: Marketplace;
}

/**
 * Minimal verification claim from the user-initiated Amazon Orders scan.
 * Only the approved minimal evidence is stored (see spec section 3).
 */
export interface OwnershipClaim {
  id: UUID;
  userId: UUID;
  canonicalProductId: UUID;
  method: VerificationMethod;
  status: OwnershipClaimStatus;
  confidence: number;
  asin: string;
  parentAsin?: string;
  purchaseMonth?: YearMonth;
  /** Hashed order id (e.g. "sha256:..."); raw order id is never stored. */
  hashedOrderId?: string;
  verifiedAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface Question {
  id: UUID;
  canonicalProductId: UUID;
  authorId: UUID;
  body: string;
  status: QuestionStatus;
  createdAt: ISODateTime;
}

export interface Answer {
  id: UUID;
  questionId: UUID;
  authorId: UUID;
  /** Enforces verified answering: must reference an approved ownership claim. */
  ownershipClaimId: UUID;
  body: string;
  isAccepted: boolean;
  helpfulCount: number;
  createdAt: ISODateTime;
}

export interface HelpfulVote {
  id: UUID;
  answerId: UUID;
  userId: UUID;
  helpful: boolean;
  createdAt: ISODateTime;
}

export type ReportTargetType = "question" | "answer" | "user";

export interface Report {
  id: UUID;
  targetType: ReportTargetType;
  targetId: UUID;
  reporterId: UUID;
  reason: string;
  status: ReportStatus;
  createdAt: ISODateTime;
}

export interface AdminAction {
  id: UUID;
  actorId: UUID;
  action: string;
  targetType: string;
  targetId: UUID;
  reason?: string;
  createdAt: ISODateTime;
}

/**
 * Minimal normalized ownership evidence captured by the user-initiated Amazon Orders scan.
 *
 * This is the ONLY evidence shape stored in v0. It intentionally excludes full order id,
 * price, shipping address, payment method, and screenshots (see docs/09 section 3 —
 * "Evidence stored"). The API DTO `SubmitOwnershipEvidenceRequest` is an alias of this type.
 */
export interface MinimalOwnershipEvidence {
  retailer: Retailer;
  marketplace: Marketplace;
  asin: string;
  parentAsin?: string;
  /** Longevity signal without exact-date exposure. */
  purchaseMonth?: YearMonth;
  /** Hashed order id ("sha256:...") for duplicate/fraud detection; raw id never stored. */
  hashedOrderId?: string;
  verificationMethod: VerificationMethod;
  capturedAt: ISODateTime;
  extensionVersion: string;
}

/**
 * Explicit v0 (MVP) constraints, kept in code so callers can assert the cut-line.
 * Source of truth: docs/09-mvp-implementation-spec.md section 1 ("Locked MVP decisions").
 */
export const V0_CONSTRAINTS = {
  marketplace: "US",
  retailer: "amazon",
  category: "earbuds",
  browser: "chrome-mv3",
  /** No affiliate tag in v0 — disclosed normal Amazon handoff only. */
  affiliateTag: null,
  verificationMethod: "amazon_orders_user_initiated_scan",
  /** Systems intentionally deferred out of v0 scope. */
  deferred: [
    "ai-answer-generation",
    "rag-vector-search",
    "graph-database",
    "contributor-payouts",
    "multi-retailer",
    "non-us-marketplace",
    "non-earbud-categories",
  ],
} as const;
