import { describe, expect, it } from "vitest";
import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";
import {
  canSubmit,
  initialVerificationState,
  verificationReducer,
  type VerificationState,
} from "./verification";

const evidence: SubmitOwnershipEvidenceRequest[] = [
  {
    retailer: "amazon",
    marketplace: "US",
    asin: "B0EXAMPLE1",
    purchaseMonth: "2025-11",
    hashedOrderId: "sha256:abc",
    verificationMethod: "amazon_orders_user_initiated_scan",
    capturedAt: "2026-06-30T00:00:00Z",
    extensionVersion: "0.1.0",
  },
];

function run(events: Parameters<typeof verificationReducer>[1][]): VerificationState {
  return events.reduce(verificationReducer, initialVerificationState);
}

describe("verification flow (user-initiated, cancel-before-submit)", () => {
  it("requires explicit START before scanning", () => {
    expect(run([{ type: "SCAN" }]).phase).toBe("idle");
  });

  it("walks idle -> explaining -> scanning -> preview -> submitting -> submitted", () => {
    const s = run([
      { type: "START" },
      { type: "SCAN" },
      { type: "SCAN_RESULT", evidence },
      { type: "CONFIRM_SUBMIT" },
      { type: "SUBMITTED", claimIds: ["claim_1"] },
    ]);
    expect(s).toEqual({ phase: "submitted", claimIds: ["claim_1"] });
  });

  it("only allows submit from the preview phase with evidence", () => {
    expect(canSubmit({ phase: "scanning" })).toBe(false);
    expect(canSubmit({ phase: "preview", evidence: [] })).toBe(false);
    expect(canSubmit({ phase: "preview", evidence })).toBe(true);
  });

  it("supports cancel BEFORE submit at every pre-submit phase", () => {
    expect(run([{ type: "START" }, { type: "CANCEL" }]).phase).toBe("idle");
    expect(run([{ type: "START" }, { type: "SCAN" }, { type: "CANCEL" }]).phase).toBe("idle");
    expect(
      run([{ type: "START" }, { type: "SCAN" }, { type: "SCAN_RESULT", evidence }, { type: "CANCEL" }]).phase,
    ).toBe("idle");
  });

  it("ignores cancel once submitting/submitted (no silent rollback)", () => {
    const submitting = run([
      { type: "START" },
      { type: "SCAN" },
      { type: "SCAN_RESULT", evidence },
      { type: "CONFIRM_SUBMIT" },
    ]);
    expect(submitting.phase).toBe("submitting");
    expect(verificationReducer(submitting, { type: "CANCEL" }).phase).toBe("submitting");
  });

  it("does not submit if confirm is dispatched without a preview", () => {
    expect(run([{ type: "START" }, { type: "SCAN" }, { type: "CONFIRM_SUBMIT" }]).phase).toBe("scanning");
  });
});
