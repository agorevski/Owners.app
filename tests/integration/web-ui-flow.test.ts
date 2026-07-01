/**
 * Integration — Touchpoint 3: Web UI <-> API / local client.
 *
 * Drives the same `LocalApiClient` the React UI uses (which dispatches the docs/09 §5 JSON
 * contracts through the real router/handlers) to prove the full community loop:
 * shopper asks -> verified owner answers -> helpful vote records -> report -> moderation
 * hide/restore -> admin metrics update. No React is needed: the client is the seam the UI
 * components call, so this is a faithful, deterministic UI-behavior integration test.
 */

import { describe, expect, it } from "vitest";
import { createHarness, seedUsers } from "../support/harness";
import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";

function confidentEvidence(asin: string, parentAsin: string): SubmitOwnershipEvidenceRequest {
  return {
    retailer: "amazon",
    marketplace: "US",
    asin,
    parentAsin,
    purchaseMonth: "2025-11",
    hashedOrderId: `sha256:${asin}`,
    verificationMethod: "amazon_orders_user_initiated_scan",
    capturedAt: new Date().toISOString(),
    extensionVersion: "0.1.0",
  };
}

describe("web UI flow: ask -> answer -> helpful -> report -> moderation -> metrics", () => {
  it("runs the community loop through the local client end to end", async () => {
    const { web, ctx } = createHarness();
    const { owner, shopper, admin } = await seedUsers(ctx);

    // Resolve a canonical earbuds product.
    const product = await web.resolveProduct({
      asin: "B0EARBUDS1",
      parentAsin: "B0PARENTA1",
      title: "Acme AirBeats Pro Wireless Earbuds",
      marketplace: "US",
    });

    // Owner verifies (confident -> auto-verified).
    web.setPrincipal(owner.id);
    const claim = await web.submitOwnershipClaim(confidentEvidence("B0EARBUDS1", "B0PARENTA1"));
    expect(claim.status).toBe("verified");

    // Shopper asks.
    web.setPrincipal(shopper.id);
    const question = await web.createQuestion({
      canonicalProductId: product.canonicalProductId,
      body: "Do these stay put during runs?",
    });

    // Verified owner answers.
    web.setPrincipal(owner.id);
    const answer = await web.createAnswer({
      questionId: question.id,
      body: "Yes — medium tips, 8 months of running, still secure.",
    });

    // The question flips open -> answered.
    const answered = await ctx.questions.findById(question.id);
    expect(answered?.status).toBe("answered");

    // Helpful vote records once; a repeat identical vote is idempotent.
    web.setPrincipal(shopper.id);
    const first = await web.markHelpful(answer.id, true);
    expect(first.helpfulCount).toBe(1);
    const repeat = (await web.markHelpful(answer.id, true)) as unknown as {
      helpfulCount: number;
      recorded: boolean;
    };
    expect(repeat.helpfulCount).toBe(1);
    expect(repeat.recorded).toBe(false);

    // Provenance is exposed as a verified-owner answer in the UI view model.
    const view = await web.getProductView(product.canonicalProductId);
    const answerView = view!.questions.find((q) => q.id === question.id)!.answers[0]!;
    expect(answerView.provenance).toBe("verified-owner");
    expect(answerView.claimStatus).toBe("verified");
    expect(view!.verifiedOwnerCount).toBe(1);

    // Shopper reports the answer -> lands in the moderation queue.
    const report = await web.createReport({
      targetType: "answer",
      targetId: answer.id,
      reason: "Suspected spam.",
    });
    const openReports = await web.listOpenReports();
    expect(openReports.map((r) => r.report.id)).toContain(report.id);

    // Admin hides the answer (resolving the report) -> excluded from public view.
    web.setPrincipal(admin.id);
    const hide = await web.moderate("answer", answer.id, "hide", report.id, "Confirmed spam.");
    expect(hide.hidden).toBe(true);
    const hiddenView = await web.getProductView(product.canonicalProductId);
    expect(hiddenView!.questions.find((q) => q.id === question.id)!.answers).toHaveLength(0);
    // The report is resolved (no longer open).
    expect((await web.listOpenReports()).map((r) => r.report.id)).not.toContain(report.id);

    // Admin restores the answer -> visible again.
    const restore = await web.moderate("answer", answer.id, "restore");
    expect(restore.hidden).toBe(false);
    const restoredView = await web.getProductView(product.canonicalProductId);
    expect(restoredView!.questions.find((q) => q.id === question.id)!.answers).toHaveLength(1);

    // A disclosed, tag-free commerce handoff intent event.
    web.setPrincipal(shopper.id);
    await web.recordEvent("commerce_handoff_clicked", { asin: "B0EARBUDS1" });

    // Metrics reflect the whole loop.
    const metrics = await web.metrics();
    expect(metrics.products).toBe(1);
    expect(metrics.questions).toBe(1);
    expect(metrics.answers).toBe(1);
    expect(metrics.ownershipClaims.verified).toBe(1);
    expect(metrics.verificationPassRate).toBe(1);
    expect(metrics.reports.total).toBe(1);
    expect(metrics.handoffs).toBe(1);
    // Two moderation actions (hide + restore) were audited.
    expect(metrics.adminActions).toBe(2);
  });
});
