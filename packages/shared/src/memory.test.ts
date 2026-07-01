import { describe, expect, it } from "vitest";
import { createInMemoryRepositories, EARBUDS_SEED, seedRepositories } from "./memory";

describe("in-memory repositories — seed data", () => {
  it("preloads Amazon.com earbuds fixtures when seeded", async () => {
    const ctx = createInMemoryRepositories({ seed: true });

    const byId = await ctx.products.findById(EARBUDS_SEED.products[0]!.id);
    expect(byId?.provisional).toBe(false);

    const byAsin = await ctx.products.findByAsin("B0EARBUD02");
    expect(byAsin?.product.id).toBe(EARBUDS_SEED.products[0]!.id); // variant maps to same canonical

    const owner = await ctx.users.findByHandle("quiet_commuter");
    expect(owner?.roles).toContain("owner");

    const verified = await ctx.ownershipClaims.findVerified(
      EARBUDS_SEED.users[0]!.id,
      EARBUDS_SEED.products[0]!.id,
    );
    expect(verified?.status).toBe("verified");
  });

  it("starts empty without the seed flag", async () => {
    const ctx = createInMemoryRepositories();
    expect(await ctx.products.findByAsin("B0EARBUD01")).toBeNull();
  });

  it("seedRepositories populates an existing context", async () => {
    const ctx = createInMemoryRepositories();
    await seedRepositories(ctx);
    expect(await ctx.products.findByAsin("B0EARBUD01")).not.toBeNull();
  });
});

describe("in-memory repositories — helpful votes", () => {
  it("stores and looks up a vote per (answer, user)", async () => {
    const ctx = createInMemoryRepositories();
    const vote = {
      id: "vote-1",
      answerId: "answer-1",
      userId: "user-1",
      helpful: true,
      createdAt: "2026-06-30T00:00:00Z",
    };
    await ctx.helpfulVotes.create(vote);
    expect(await ctx.helpfulVotes.find("answer-1", "user-1")).toEqual(vote);
    expect(await ctx.helpfulVotes.find("answer-1", "user-2")).toBeNull();
  });

  it("increments an answer's helpful count", async () => {
    const ctx = createInMemoryRepositories();
    await ctx.answers.create({
      id: "answer-1",
      questionId: "q-1",
      authorId: "owner-1",
      ownershipClaimId: "claim-1",
      body: "Great on the train.",
      isAccepted: false,
      helpfulCount: 0,
      createdAt: "2026-06-30T00:00:00Z",
    });
    const updated = await ctx.answers.incrementHelpful("answer-1", 1);
    expect(updated?.helpfulCount).toBe(1);
    expect(await ctx.answers.incrementHelpful("missing", 1)).toBeNull();
  });
});

describe("in-memory repositories — reports", () => {
  it("lists only open reports", async () => {
    const ctx = createInMemoryRepositories();
    await ctx.reports.create({
      id: "report-1",
      targetType: "answer",
      targetId: "answer-1",
      reporterId: "user-1",
      reason: "spam",
      status: "open",
      createdAt: "2026-06-30T00:00:00Z",
    });
    await ctx.reports.create({
      id: "report-2",
      targetType: "question",
      targetId: "q-1",
      reporterId: "user-2",
      reason: "off-topic",
      status: "dismissed",
      createdAt: "2026-06-30T00:00:00Z",
    });
    const open = await ctx.reports.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]!.id).toBe("report-1");
  });
});

describe("in-memory repositories — admin actions & claim status", () => {
  it("records admin actions and updates claim status", async () => {
    const ctx = createInMemoryRepositories({ seed: true });
    const claimId = EARBUDS_SEED.ownershipClaims[0]!.id;

    const revoked = await ctx.ownershipClaims.updateStatus(claimId, "revoked");
    expect(revoked?.status).toBe("revoked");

    const action = await ctx.adminActions.create({
      id: "admin-1",
      actorId: EARBUDS_SEED.users[2]!.id,
      action: "revoke_ownership_claim",
      targetType: "ownership_claim",
      targetId: claimId,
      reason: "refund confirmed",
      createdAt: "2026-06-30T00:00:00Z",
    });
    expect(action.action).toBe("revoke_ownership_claim");
  });
});
