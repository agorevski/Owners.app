/**
 * User-initiated verification flow state machine (docs/09 section 3 & 7).
 *
 * Guarantees the hard rules: scanning only happens after explicit user action, the user
 * always sees an evidence preview, and there is a cancel path BEFORE anything is submitted.
 * Pure and framework-free so it is unit-testable and reusable by the sidebar UI.
 */

import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";

export type VerificationState =
  | { phase: "idle" }
  | { phase: "explaining" }
  | { phase: "scanning" }
  | { phase: "preview"; evidence: SubmitOwnershipEvidenceRequest[] }
  | { phase: "submitting"; evidence: SubmitOwnershipEvidenceRequest[] }
  | { phase: "submitted"; claimIds: string[] }
  | { phase: "error"; message: string };

export type VerificationEvent =
  | { type: "START" } // user clicked "Verify earbuds I own"
  | { type: "SCAN" } // user clicked "Scan this page" on Amazon Orders
  | { type: "SCAN_RESULT"; evidence: SubmitOwnershipEvidenceRequest[] }
  | { type: "CONFIRM_SUBMIT" } // user confirms after reviewing the preview
  | { type: "SUBMITTED"; claimIds: string[] }
  | { type: "CANCEL" }
  | { type: "FAIL"; message: string };

export const initialVerificationState: VerificationState = { phase: "idle" };

/** True only when submission is permitted (explicit confirm from the preview phase). */
export function canSubmit(state: VerificationState): boolean {
  return state.phase === "preview" && state.evidence.length > 0;
}

/** Pure reducer. Cancel is honored in every pre-submit phase and never after submit. */
export function verificationReducer(
  state: VerificationState,
  event: VerificationEvent,
): VerificationState {
  switch (event.type) {
    case "START":
      return state.phase === "idle" ? { phase: "explaining" } : state;
    case "SCAN":
      return state.phase === "explaining" ? { phase: "scanning" } : state;
    case "SCAN_RESULT":
      return state.phase === "scanning" ? { phase: "preview", evidence: event.evidence } : state;
    case "CONFIRM_SUBMIT":
      return canSubmit(state)
        ? { phase: "submitting", evidence: (state as { evidence: SubmitOwnershipEvidenceRequest[] }).evidence }
        : state;
    case "SUBMITTED":
      return state.phase === "submitting" ? { phase: "submitted", claimIds: event.claimIds } : state;
    case "FAIL":
      return { phase: "error", message: event.message };
    case "CANCEL":
      // Cancel is a no-op once submission has started or completed.
      if (state.phase === "submitting" || state.phase === "submitted") return state;
      return { phase: "idle" };
    default:
      return state;
  }
}
