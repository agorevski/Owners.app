import { describe, expect, it } from "vitest";
import { ApiClientError, LocalApiClient } from "./localClient";
import { SessionManager } from "./session";
import { seedDemoData } from "./seed";

async function freshSeeded() {
  const client = new LocalApiClient();
  const session = new SessionManager(client);
  const seed = await seedDemoData(client, session);
  return { client, session, seed };
}

describe("LocalApiClient — seeded product Q&A view", () => {
  it("exposes the resolved earbuds product with prior verified-owner Q&A", async () => {
    const { client, seed } = await freshSeeded();
    const view = await client.getProductView(seed.earbudsProductId);
    expect(view).not.toBeNull();
    expect(view!.product.title).toContain("AirBeats");
    expect(view!.product.provisional).toBe(false);
    expect(view!.verifiedOwnerCount).toBe(1);
    expect(view!.primaryAsin).toBe("B0EARBUDS1");

    const answered = view!.questions.find((q) => q.id === seed.answeredQuestionId);
    expect(answered).toBeDefined();
    expect(answered!.answers).toHaveLength(1);
    const answer = answered!.answers[0]!;
    expect(answer.provenance).toBe("verified-owner");
    expect(answer.claimStatus).toBe("verified");
    expect(answer.authorHandle).toBe(seed.ownerUser.handle);
    expect(answer.helpfulCount).toBe(2);
  });
});

describe("LocalApiClient — ask flow", () => {
  it("lets a shopper post a question that appears in the product view", async () => {
    const { client, seed } = await freshSeeded();
    client.setPrincipal(seed.shopperUser.id);
    await client.createQuestion({ canonicalProductId: seed.earbudsProductId, body: "Sweat resistant?" });
    const view = await client.getProductView(seed.earbudsProductId);
    expect(view!.questions.some((q) => q.body === "Sweat resistant?")).toBe(true);
  });
});

describe("LocalApiClient — answer flow enforces verified ownership", () => {
  it("allows a verified owner to answer their product's question", async () => {
    const { client, seed } = await freshSeeded();
    client.setPrincipal(seed.ownerUser.id);
    const answer = await client.createAnswer({ questionId: seed.openQuestionId, body: "Yes, wireless charging works." });
    expect(answer.ownershipClaimId).toBeTruthy();
  });

  it("rejects a shopper (no ownership) with OWNERSHIP_REQUIRED", async () => {
    const { client, seed } = await freshSeeded();
    client.setPrincipal(seed.shopperUser.id);
    await expect(
      client.createAnswer({ questionId: seed.openQuestionId, body: "I don't own these." }),
    ).rejects.toMatchObject({ code: "OWNERSHIP_REQUIRED" });
  });

  it("rejects an owner with only a pending claim (wrong/pending state)", async () => {
    const { client, seed } = await freshSeeded();
    // secondOwner has a pending claim for the provisional product, not the earbuds.
    client.setPrincipal(seed.secondOwnerUser.id);
    const err = await client
      .createAnswer({ questionId: seed.openQuestionId, body: "Trying without verification." })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe("OWNERSHIP_REQUIRED");
  });
});

describe("LocalApiClient — helpful feedback", () => {
  it("increments helpful count and is idempotent per user", async () => {
    const { client, seed } = await freshSeeded();
    const view = await client.getProductView(seed.earbudsProductId);
    const answerId = view!.questions.find((q) => q.id === seed.answeredQuestionId)!.answers[0]!.id;

    client.setPrincipal("new-voter");
    const first = await client.markHelpful(answerId, true);
    expect(first.helpfulCount).toBe(3);
    const again = await client.markHelpful(answerId, true);
    expect(again.helpfulCount).toBe(3);
  });
});

describe("LocalApiClient — owner dashboard (recognition only)", () => {
  it("reports verified products, routed questions, and top-helper status", async () => {
    const { client, seed } = await freshSeeded();
    const dash = await client.getOwnerDashboard(seed.ownerUser.id);
    expect(dash.verifiedProducts).toHaveLength(1);
    expect(dash.answersGiven).toBe(1);
    expect(dash.helpfulReceived).toBe(2);
    expect(dash.isTopHelper).toBe(true);
    expect(dash.routedQuestions.some((r) => r.question.id === seed.openQuestionId)).toBe(true);
    // Recognition-only: the view exposes no monetary fields.
    expect(Object.keys(dash)).not.toContain("earnings");
  });
});

describe("LocalApiClient — admin queues", () => {
  it("lists provisional products and merges them, preserving references", async () => {
    const { client, seed } = await freshSeeded();
    const provisional = await client.listProvisionalProducts();
    expect(provisional.some((p) => p.id === seed.provisionalProductId)).toBe(true);

    const res = await client.mergeProducts(seed.provisionalProductId, seed.earbudsProductId, "test merge");
    expect(res.movedAsins).toBeGreaterThanOrEqual(1);
    const afterMerge = await client.listProvisionalProducts();
    expect(afterMerge.some((p) => p.id === seed.provisionalProductId)).toBe(false);
  });

  it("approves a pending verification claim", async () => {
    const { client, seed } = await freshSeeded();
    const pending = await client.listPendingClaims();
    expect(pending).toHaveLength(1);
    const decided = await client.decideVerification(pending[0]!.claim.id, "approve");
    expect(decided.status).toBe("verified");
    expect(await client.listPendingClaims()).toHaveLength(0);
  });

  it("hides reported content and resolves the report", async () => {
    const { client, seed } = await freshSeeded();
    const reports = await client.listOpenReports();
    expect(reports).toHaveLength(1);
    const target = reports[0]!;
    await client.moderate(target.report.targetType as "question", target.report.targetId, "hide", target.report.id);

    // Hidden content is excluded from the public product view.
    const view = await client.getProductView(seed.earbudsProductId);
    expect(view!.questions.some((q) => q.id === seed.answeredQuestionId)).toBe(false);
    // The report is resolved (no longer open).
    expect(await client.listOpenReports()).toHaveLength(0);
  });

  it("summarizes funnel metrics including handoffs", async () => {
    const { client, seed } = await freshSeeded();
    client.setPrincipal(seed.shopperUser.id);
    await client.recordEvent("commerce_handoff_clicked", { asin: "B0EARBUDS1" });
    const metrics = await client.metrics();
    expect(metrics.products).toBeGreaterThanOrEqual(2);
    expect(metrics.handoffs).toBe(1);
    expect(metrics.ownershipClaims.verified).toBeGreaterThanOrEqual(1);
  });
});

describe("LocalApiClient — no-affiliate commerce posture", () => {
  it("strips any affiliate tag from recorded handoff events", async () => {
    const { client } = await freshSeeded();
    await client.recordEvent("commerce_handoff_clicked", {
      url: "https://www.amazon.com/dp/B0EARBUDS1?tag=evil-20",
      tag: "evil-20",
    });
    const events = await client.ctx.analyticsEvents.list();
    const handoff = events.find((e) => e.name === "commerce_handoff_clicked");
    expect(JSON.stringify(handoff)).not.toContain("evil-20");
    expect(JSON.stringify(handoff)).not.toContain("tag=");
  });
});
