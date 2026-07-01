/**
 * Validation & normalization helpers for the v0 domain.
 *
 * Covers Amazon.com ASINs, parent ASINs, marketplace, purchase month, hashed order id,
 * and pseudonymous handles. All helpers are pure and dependency-free.
 *
 * Source of truth: docs/09-mvp-implementation-spec.md section 3 ("Evidence stored") and
 * section 6 ("v0 relational data model"); docs/05 ("least privilege for PII").
 */

import { isValidAsin, normalizeAsin } from "./product";
import type { Marketplace, MinimalOwnershipEvidence, Retailer, VerificationMethod, YearMonth } from "./types";

/** Discriminated result used by validators that also normalize their input. */
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** The only marketplace supported in v0. */
export const SUPPORTED_MARKETPLACE: Marketplace = "US";
/** The only retailer supported in v0. */
export const SUPPORTED_RETAILER: Retailer = "amazon";
/** The only verification method supported in v0. */
export const SUPPORTED_VERIFICATION_METHOD: VerificationMethod = "amazon_orders_user_initiated_scan";

export function isSupportedMarketplace(value: string): value is Marketplace {
  return value === SUPPORTED_MARKETPLACE;
}

export function isSupportedRetailer(value: string): value is Retailer {
  return value === SUPPORTED_RETAILER;
}

// --- ASIN / parent ASIN -----------------------------------------------------

/** Parent/variation ASIN uses the same format rules as a child ASIN. */
export function isValidParentAsin(value: string): boolean {
  return isValidAsin(value);
}

// --- Purchase month (YYYY-MM) ----------------------------------------------

const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** Amazon.com launched in 1994; reject implausible years to catch parse errors. */
const MIN_PURCHASE_YEAR = 1994;

/** Validates a "YYYY-MM" purchase month, rejecting future months and implausible years. */
export function isValidYearMonth(value: string, now: Date = new Date()): boolean {
  const match = YEAR_MONTH_PATTERN.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < MIN_PURCHASE_YEAR) return false;
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  if (year > nowYear || (year === nowYear && month > nowMonth)) return false;
  return true;
}

export function normalizeYearMonth(value: string): YearMonth {
  return value.trim();
}

// --- Hashed order id --------------------------------------------------------

const HASHED_ORDER_ID_PATTERN = /^sha256:[a-f0-9]{64}$/;

/**
 * A stored order id must be a hashed digest, never a raw Amazon order id.
 * v0 convention: "sha256:" + 64 lowercase hex chars.
 */
export function isValidHashedOrderId(value: string): boolean {
  return HASHED_ORDER_ID_PATTERN.test(value.trim().toLowerCase());
}

export function normalizeHashedOrderId(value: string): string {
  return value.trim().toLowerCase();
}

// --- Pseudonymous handle ----------------------------------------------------

const HANDLE_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

/** Normalize a handle to its canonical (lowercase, trimmed) form. */
export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Pseudonymous public handle: 3-30 chars, lowercase alphanumeric + underscore,
 * must start with a letter. Never a real name or email.
 */
export function isValidHandle(value: string): boolean {
  return HANDLE_PATTERN.test(normalizeHandle(value));
}

// --- Minimal ownership evidence --------------------------------------------

/**
 * Validate and normalize the minimal Amazon Orders scan evidence payload.
 *
 * Enforces the v0 cut-line (Amazon.com / US / user-initiated scan) and the minimal
 * evidence model. Returns a normalized copy so callers persist canonical values.
 */
export function validateOwnershipEvidence(
  input: MinimalOwnershipEvidence,
  now: Date = new Date(),
): ValidationResult<MinimalOwnershipEvidence> {
  const errors: string[] = [];

  if (!isSupportedRetailer(input.retailer)) {
    errors.push(`Unsupported retailer "${input.retailer}"; v0 supports "amazon" only.`);
  }
  if (!isSupportedMarketplace(input.marketplace)) {
    errors.push(`Unsupported marketplace "${input.marketplace}"; v0 supports "US" only.`);
  }
  if (input.verificationMethod !== SUPPORTED_VERIFICATION_METHOD) {
    errors.push(
      `Unsupported verification method "${input.verificationMethod}"; v0 supports "${SUPPORTED_VERIFICATION_METHOD}".`,
    );
  }
  if (!isValidAsin(input.asin)) {
    errors.push(`Invalid ASIN "${input.asin}".`);
  }
  if (input.parentAsin !== undefined && !isValidParentAsin(input.parentAsin)) {
    errors.push(`Invalid parent ASIN "${input.parentAsin}".`);
  }
  if (input.purchaseMonth !== undefined && !isValidYearMonth(input.purchaseMonth, now)) {
    errors.push(`Invalid purchase month "${input.purchaseMonth}"; expected "YYYY-MM".`);
  }
  if (input.hashedOrderId !== undefined && !isValidHashedOrderId(input.hashedOrderId)) {
    errors.push(`Invalid hashed order id; expected "sha256:<64 hex>".`);
  }
  if (Number.isNaN(Date.parse(input.capturedAt))) {
    errors.push(`Invalid capturedAt timestamp "${input.capturedAt}".`);
  }
  if (!input.extensionVersion.trim()) {
    errors.push("Missing extensionVersion.");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const value: MinimalOwnershipEvidence = {
    retailer: SUPPORTED_RETAILER,
    marketplace: SUPPORTED_MARKETPLACE,
    asin: normalizeAsin(input.asin),
    verificationMethod: SUPPORTED_VERIFICATION_METHOD,
    capturedAt: input.capturedAt,
    extensionVersion: input.extensionVersion.trim(),
    ...(input.parentAsin !== undefined ? { parentAsin: normalizeAsin(input.parentAsin) } : {}),
    ...(input.purchaseMonth !== undefined
      ? { purchaseMonth: normalizeYearMonth(input.purchaseMonth) }
      : {}),
    ...(input.hashedOrderId !== undefined
      ? { hashedOrderId: normalizeHashedOrderId(input.hashedOrderId) }
      : {}),
  };
  return { ok: true, value };
}
