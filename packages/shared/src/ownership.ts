/**
 * Ownership verification business rules for v0.
 *
 * Implements the minimal-evidence confidence model, the verified/pending/rejected/revoked
 * lifecycle, and the core answering invariant: a verified owner may only answer for the
 * canonical product covered by an approved (verified) ownership claim.
 *
 * Source of truth: docs/09 sections 3 & 6 (enforcement rules) and docs/05
 * ("Confidence Scoring & Verification Lifecycle").
 *
 * Terminology note: docs/05 uses "approved" for a claim that passes review; the persisted
 * status value for that state is `"verified"` (docs/04 schema). `isApprovedClaim` /
 * `isVerifiedClaim` are synonyms here.
 */

import { isProvisionalResolution } from "./product";
import type {
  ISODateTime,
  MinimalOwnershipEvidence,
  OwnershipClaim,
  OwnershipClaimStatus,
  UUID,
  VerificationMethod,
} from "./types";

/**
 * Base evidence strength per verification method (noisy-OR base_strength from docs/05).
 * Only `amazon_orders_user_initiated_scan` is exercised in v0; the rest are target-state.
 */
export const VERIFICATION_METHOD_BASE_STRENGTH: Record<VerificationMethod, number> = {
  amazon_orders_user_initiated_scan: 0.9,
  retailer_link: 0.8,
  serial: 0.8,
  receipt: 0.6,
  photo: 0.4,
  attestation: 0.3,
};

/** Minimum confidence for automatic approval; below this a claim goes to manual review. */
export const AUTO_APPROVE_CONFIDENCE_THRESHOLD = 0.85;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Compute ownership confidence in [0, 1] from the minimal evidence.
 *
 * v0 is a single-evidence model, so this is the method base strength adjusted by
 * multiplicative penalties for missing signals (mirrors the forgery/independence
 * discounting in the docs/05 confidence sketch):
 *  - missing hashed order id  → weaker fraud/duplicate resistance
 *  - missing purchase month   → weaker longevity signal
 *  - provisional product      → weaker canonical grouping
 */
export function computeOwnershipConfidence(evidence: MinimalOwnershipEvidence): number {
  let confidence = VERIFICATION_METHOD_BASE_STRENGTH[evidence.verificationMethod] ?? 0;
  if (!evidence.hashedOrderId) confidence *= 0.9;
  if (!evidence.purchaseMonth) confidence *= 0.97;
  if (isProvisionalResolution(evidence.parentAsin)) confidence *= 0.9;
  return round3(clamp01(confidence));
}

/** Outcome of evaluating submitted evidence: a confidence score and an initial status. */
export interface OwnershipEvaluation {
  confidence: number;
  status: Extract<OwnershipClaimStatus, "verified" | "pending">;
}

/**
 * Decide the initial claim status from evidence. Fail-closed: a claim is only auto-verified
 * when confidence clears the threshold, a hashed order id is present (duplicate resistance),
 * and the product is non-provisional. Everything else is queued as `pending` for review.
 */
export function evaluateOwnershipEvidence(evidence: MinimalOwnershipEvidence): OwnershipEvaluation {
  const confidence = computeOwnershipConfidence(evidence);
  const autoApprove =
    confidence >= AUTO_APPROVE_CONFIDENCE_THRESHOLD &&
    !!evidence.hashedOrderId &&
    !isProvisionalResolution(evidence.parentAsin);
  return { confidence, status: autoApprove ? "verified" : "pending" };
}

/** Parameters for constructing a claim; ids/timestamps injected by the caller. */
export interface CreateOwnershipClaimInput {
  id: UUID;
  userId: UUID;
  canonicalProductId: UUID;
  evidence: MinimalOwnershipEvidence;
  createdAt: ISODateTime;
}

/**
 * Build an `OwnershipClaim` from validated evidence, applying the confidence/status
 * evaluation. Pure — persistence is the caller's responsibility.
 */
export function createOwnershipClaimFromEvidence(input: CreateOwnershipClaimInput): OwnershipClaim {
  const { confidence, status } = evaluateOwnershipEvidence(input.evidence);
  return {
    id: input.id,
    userId: input.userId,
    canonicalProductId: input.canonicalProductId,
    method: input.evidence.verificationMethod,
    status,
    confidence,
    asin: input.evidence.asin,
    createdAt: input.createdAt,
    ...(input.evidence.parentAsin !== undefined ? { parentAsin: input.evidence.parentAsin } : {}),
    ...(input.evidence.purchaseMonth !== undefined
      ? { purchaseMonth: input.evidence.purchaseMonth }
      : {}),
    ...(input.evidence.hashedOrderId !== undefined
      ? { hashedOrderId: input.evidence.hashedOrderId }
      : {}),
    ...(status === "verified" ? { verifiedAt: input.createdAt } : {}),
  };
}

/**
 * Allowed ownership-claim state transitions (docs/05 verification lifecycle).
 * `revoked` is terminal; `rejected` may resubmit (returning to `pending`).
 */
export const OWNERSHIP_CLAIM_TRANSITIONS: Record<OwnershipClaimStatus, readonly OwnershipClaimStatus[]> = {
  pending: ["verified", "rejected"],
  verified: ["verified", "revoked"],
  rejected: ["pending"],
  revoked: [],
};

export function canTransitionOwnershipClaim(
  from: OwnershipClaimStatus,
  to: OwnershipClaimStatus,
): boolean {
  return OWNERSHIP_CLAIM_TRANSITIONS[from].includes(to);
}

/** A claim is approved/verified when its status is exactly `"verified"`. */
export function isVerifiedClaim(claim: Pick<OwnershipClaim, "status">): boolean {
  return claim.status === "verified";
}

/** Synonym for {@link isVerifiedClaim} matching docs/05 "approved" terminology. */
export const isApprovedClaim = isVerifiedClaim;

/**
 * Core answering invariant: the author may only answer when they hold a verified claim
 * for the exact canonical product the question is attached to.
 */
export function canUserAnswer(
  claim: Pick<OwnershipClaim, "status" | "canonicalProductId"> | null | undefined,
  canonicalProductId: UUID,
): boolean {
  return !!claim && isVerifiedClaim(claim) && claim.canonicalProductId === canonicalProductId;
}
