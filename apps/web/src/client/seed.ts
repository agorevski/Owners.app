/**
 * Deterministic demo seed for the v0 web prototype.
 *
 * Populates the in-memory context with a resolved Amazon earbuds product, prior verified-owner
 * Q&A, an open question awaiting an answer, a provisional product + pending claim for the admin
 * queues, and an open moderation report — enough to exercise every user-facing flow end-to-end
 * without a backend.
 *
 * All mutations go through the same handlers as production code, so the ownership invariant and
 * moderation rules hold. Public identities are pseudonymous handles only.
 */

import type { SubmitOwnershipEvidenceRequest, User } from "@owners/shared";
import type { LocalApiClient } from "./localClient";
import type { SessionManager } from "./session";

export interface SeedResult {
  earbudsProductId: string;
  provisionalProductId: string;
  answeredQuestionId: string;
  openQuestionId: string;
  ownerUser: User;
  secondOwnerUser: User;
  shopperUser: User;
  adminUser: User;
  accounts: User[];
}

function evidence(
  asin: string,
  parentAsin: string | undefined,
  purchaseMonth: string,
): SubmitOwnershipEvidenceRequest {
  return {
    retailer: "amazon",
    marketplace: "US",
    asin,
    parentAsin,
    purchaseMonth,
    hashedOrderId: `sha256:${asin}`,
    verificationMethod: "amazon_orders_user_initiated_scan",
    capturedAt: new Date().toISOString(),
    extensionVersion: "0.1.0",
  };
}

/** Seed the demo dataset. Idempotent per fresh client (each client owns an isolated ctx). */
export async function seedDemoData(
  client: LocalApiClient,
  session: SessionManager,
): Promise<SeedResult> {
  const now = new Date().toISOString();

  const ownerUser: User = {
    id: crypto.randomUUID(),
    handle: "calm-otter-204",
    email: "owner@example.com",
    displayName: "Owner (private)",
    roles: ["owner", "shopper"],
    createdAt: now,
  };
  const secondOwnerUser: User = {
    id: crypto.randomUUID(),
    handle: "amber-finch-311",
    email: "owner2@example.com",
    roles: ["owner", "shopper"],
    createdAt: now,
  };
  const shopperUser: User = {
    id: crypto.randomUUID(),
    handle: "swift-wren-158",
    email: "shopper@example.com",
    roles: ["shopper"],
    createdAt: now,
  };
  const adminUser: User = {
    id: crypto.randomUUID(),
    handle: "owners-admin",
    email: "admin@example.com",
    roles: ["admin", "moderator", "shopper"],
    createdAt: now,
  };

  const accounts = [ownerUser, secondOwnerUser, shopperUser, adminUser];
  for (const account of accounts) {
    await client.ctx.users.create(account);
    session.registerAccount(account);
  }

  // Canonical earbuds product (parent/variation backed => confident, non-provisional).
  const earbuds = await client.resolveProduct({
    asin: "B0EARBUDS1",
    parentAsin: "B0PARENTA1",
    title: "Acme AirBeats Pro Wireless Earbuds",
    marketplace: "US",
  });

  // Owner verifies ownership of the earbuds -> auto-verified.
  client.setPrincipal(ownerUser.id);
  await client.submitOwnershipClaim(evidence("B0EARBUDS1", "B0PARENTA1", "2025-11"));

  // Prior Q&A: shopper asks, verified owner answers.
  client.setPrincipal(shopperUser.id);
  const answeredQuestion = await client.createQuestion({
    canonicalProductId: earbuds.canonicalProductId,
    body: "Do these stay in during runs, and how is the battery after a year?",
  });

  client.setPrincipal(ownerUser.id);
  const answer = await client.createAnswer({
    questionId: answeredQuestion.id,
    body: "I've run with them ~4x/week for 8 months — they stay put with the medium tips, and battery still gets ~5 hours.",
  });

  // Helpful votes build recognition + top-helper status.
  client.setPrincipal(shopperUser.id);
  await client.markHelpful(answer.id, true);
  client.setPrincipal(adminUser.id);
  await client.markHelpful(answer.id, true);

  // A second, still-open question feeds the routed inbox and the live answer flow.
  client.setPrincipal(shopperUser.id);
  const openQuestion = await client.createQuestion({
    canonicalProductId: earbuds.canonicalProductId,
    body: "Is the case pocket-friendly, and does it support wireless charging?",
  });

  // A provisional (exact-ASIN only) product for the admin merge queue.
  const provisional = await client.resolveProduct({
    asin: "B0PROVIS01",
    title: "AirBeats Pro (Midnight) — provisional listing",
    marketplace: "US",
  });

  // A pending ambiguous claim for the admin verification review queue.
  client.setPrincipal(secondOwnerUser.id);
  await client.submitOwnershipClaim(evidence("B0PROVIS01", undefined, "2026-01"));

  // An open moderation report on the answered question.
  client.setPrincipal(shopperUser.id);
  await client.createReport({
    targetType: "question",
    targetId: answeredQuestion.id,
    reason: "Looks like off-topic promotion.",
  });

  // Reset to anonymous so the app boots signed-out.
  client.setPrincipal("anonymous");

  return {
    earbudsProductId: earbuds.canonicalProductId,
    provisionalProductId: provisional.canonicalProductId,
    answeredQuestionId: answeredQuestion.id,
    openQuestionId: openQuestion.id,
    ownerUser,
    secondOwnerUser,
    shopperUser,
    adminUser,
    accounts,
  };
}
