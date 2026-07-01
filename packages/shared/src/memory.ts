/**
 * In-memory `RepositoryContext` implementation with Amazon.com earbuds seed data.
 *
 * This is the canonical local/E2E persistence adapter. The Vercel/Supabase target replaces
 * it with a Postgres-backed adapter implementing the same ports from `./repositories`.
 * Keep this storage-agnostic and side-effect free per call.
 *
 * NOTE (downstream integration): `apps/web/src/server/memoryRepositories.ts` currently holds
 * a near-identical copy. It can be replaced with a re-export of `createInMemoryRepositories`
 * from `@owners/shared` to remove the duplication.
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
import type {
  AdminActionRepository,
  AnswerRepository,
  HelpfulVoteRepository,
  OwnershipClaimRepository,
  ProductRepository,
  QuestionRepository,
  ReportRepository,
  RepositoryContext,
  UserRepository,
} from "./repositories";

function createUserRepo(store: Map<UUID, User>): UserRepository {
  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findByHandle(handle) {
      for (const u of store.values()) {
        if (u.handle === handle) return u;
      }
      return null;
    },
    async create(user) {
      store.set(user.id, user);
      return user;
    },
  };
}

function createProductRepo(
  products: Map<UUID, CanonicalProduct>,
  asins: Map<string, AmazonAsin>,
): ProductRepository {
  return {
    async findById(id) {
      return products.get(id) ?? null;
    },
    async findByAsin(asin) {
      const mapping = asins.get(asin);
      if (!mapping) return null;
      const product = products.get(mapping.canonicalProductId);
      if (!product) return null;
      return { product, asin: mapping };
    },
    async create(product) {
      products.set(product.id, product);
      return product;
    },
    async linkAsin(mapping) {
      asins.set(mapping.asin, mapping);
      return mapping;
    },
  };
}

function createOwnershipRepo(store: Map<UUID, OwnershipClaim>): OwnershipClaimRepository {
  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
    async create(claim) {
      store.set(claim.id, claim);
      return claim;
    },
    async findVerified(userId, canonicalProductId) {
      for (const c of store.values()) {
        if (
          c.userId === userId &&
          c.canonicalProductId === canonicalProductId &&
          c.status === "verified"
        ) {
          return c;
        }
      }
      return null;
    },
    async updateStatus(id, status) {
      const claim = store.get(id);
      if (!claim) return null;
      const updated: OwnershipClaim = { ...claim, status };
      store.set(id, updated);
      return updated;
    },
  };
}

function createQuestionRepo(store: Map<UUID, Question>): QuestionRepository {
  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
    async listByProduct(canonicalProductId) {
      return [...store.values()].filter((q) => q.canonicalProductId === canonicalProductId);
    },
    async create(question) {
      store.set(question.id, question);
      return question;
    },
  };
}

function createAnswerRepo(store: Map<UUID, Answer>): AnswerRepository {
  return {
    async listByQuestion(questionId) {
      return [...store.values()].filter((a) => a.questionId === questionId);
    },
    async create(answer) {
      store.set(answer.id, answer);
      return answer;
    },
    async incrementHelpful(answerId, delta) {
      const answer = store.get(answerId);
      if (!answer) return null;
      const updated: Answer = { ...answer, helpfulCount: answer.helpfulCount + delta };
      store.set(answerId, updated);
      return updated;
    },
  };
}

function createHelpfulVoteRepo(store: Map<string, HelpfulVote>): HelpfulVoteRepository {
  const key = (answerId: UUID, userId: UUID) => `${answerId}:${userId}`;
  return {
    async create(vote) {
      store.set(key(vote.answerId, vote.userId), vote);
      return vote;
    },
    async find(answerId, userId) {
      return store.get(key(answerId, userId)) ?? null;
    },
  };
}

function createReportRepo(store: Map<UUID, Report>): ReportRepository {
  return {
    async create(report) {
      store.set(report.id, report);
      return report;
    },
    async listOpen() {
      return [...store.values()].filter((r) => r.status === "open");
    },
  };
}

function createAdminActionRepo(store: AdminAction[]): AdminActionRepository {
  return {
    async create(action) {
      store.push(action);
      return action;
    },
  };
}

// --- Seed data (Amazon.com earbuds) ----------------------------------------

const SEED_TS = "2026-01-01T00:00:00Z";

/** Deterministic seed dataset for local E2E and tests: Amazon.com US earbuds only. */
export const EARBUDS_SEED: {
  users: User[];
  products: CanonicalProduct[];
  asins: AmazonAsin[];
  ownershipClaims: OwnershipClaim[];
  questions: Question[];
} = {
  users: [
    {
      id: "00000000-0000-4000-8000-000000000101",
      handle: "quiet_commuter",
      roles: ["owner"],
      createdAt: SEED_TS,
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      handle: "curious_shopper",
      roles: ["shopper"],
      createdAt: SEED_TS,
    },
    {
      id: "00000000-0000-4000-8000-0000000001ad",
      handle: "owners_admin",
      roles: ["admin", "moderator"],
      createdAt: SEED_TS,
    },
  ],
  products: [
    {
      id: "00000000-0000-4000-8000-000000000201",
      title: "Acme SoundPods Pro — Active Noise Cancelling Wireless Earbuds",
      manufacturer: "Acme Audio",
      modelNumber: "SP-PRO-2",
      provisional: false,
      createdAt: SEED_TS,
    },
    {
      id: "00000000-0000-4000-8000-000000000202",
      title: "Nimbus AirBuds Lite — In-Ear Bluetooth Earbuds",
      manufacturer: "Nimbus",
      modelNumber: "AB-LITE",
      provisional: false,
      createdAt: SEED_TS,
    },
  ],
  asins: [
    {
      asin: "B0EARBUD01",
      parentAsin: "B0EARBPRN1",
      canonicalProductId: "00000000-0000-4000-8000-000000000201",
      marketplace: "US",
    },
    {
      asin: "B0EARBUD02",
      parentAsin: "B0EARBPRN1",
      canonicalProductId: "00000000-0000-4000-8000-000000000201",
      marketplace: "US",
    },
    {
      asin: "B0EARBUD10",
      parentAsin: "B0EARBPRN2",
      canonicalProductId: "00000000-0000-4000-8000-000000000202",
      marketplace: "US",
    },
  ],
  ownershipClaims: [
    {
      id: "00000000-0000-4000-8000-000000000301",
      userId: "00000000-0000-4000-8000-000000000101",
      canonicalProductId: "00000000-0000-4000-8000-000000000201",
      method: "amazon_orders_user_initiated_scan",
      status: "verified",
      confidence: 0.9,
      asin: "B0EARBUD01",
      parentAsin: "B0EARBPRN1",
      purchaseMonth: "2025-11",
      hashedOrderId: "sha256:" + "a".repeat(64),
      verifiedAt: SEED_TS,
      createdAt: SEED_TS,
    },
  ],
  questions: [
    {
      id: "00000000-0000-4000-8000-000000000401",
      canonicalProductId: "00000000-0000-4000-8000-000000000201",
      authorId: "00000000-0000-4000-8000-000000000102",
      body: "How is the noise cancelling on a noisy train commute?",
      status: "open",
      createdAt: SEED_TS,
    },
  ],
};

/**
 * Load the earbuds seed dataset into a repository context. Awaitable; useful when a caller
 * already holds a context (e.g. a Postgres-backed adapter) and wants the same fixtures.
 */
export async function seedRepositories(ctx: RepositoryContext): Promise<void> {
  for (const user of EARBUDS_SEED.users) {
    await ctx.users.create({ ...user, roles: [...user.roles] });
  }
  for (const product of EARBUDS_SEED.products) {
    await ctx.products.create({ ...product });
  }
  for (const mapping of EARBUDS_SEED.asins) {
    await ctx.products.linkAsin({ ...mapping });
  }
  for (const claim of EARBUDS_SEED.ownershipClaims) {
    await ctx.ownershipClaims.create({ ...claim });
  }
  for (const question of EARBUDS_SEED.questions) {
    await ctx.questions.create({ ...question });
  }
}

export interface CreateInMemoryRepositoriesOptions {
  /** When true, preload the Amazon.com earbuds seed dataset. Default: false. */
  seed?: boolean;
}

/** Create a fresh in-memory `RepositoryContext`, optionally preloaded with seed data. */
export function createInMemoryRepositories(
  options: CreateInMemoryRepositoriesOptions = {},
): RepositoryContext {
  const userStore = new Map<UUID, User>();
  const productStore = new Map<UUID, CanonicalProduct>();
  const asinStore = new Map<string, AmazonAsin>();
  const claimStore = new Map<UUID, OwnershipClaim>();
  const questionStore = new Map<UUID, Question>();

  if (options.seed) {
    // Populate the underlying maps synchronously so seeded data is available immediately.
    for (const user of EARBUDS_SEED.users) {
      userStore.set(user.id, { ...user, roles: [...user.roles] });
    }
    for (const product of EARBUDS_SEED.products) {
      productStore.set(product.id, { ...product });
    }
    for (const mapping of EARBUDS_SEED.asins) {
      asinStore.set(mapping.asin, { ...mapping });
    }
    for (const claim of EARBUDS_SEED.ownershipClaims) {
      claimStore.set(claim.id, { ...claim });
    }
    for (const question of EARBUDS_SEED.questions) {
      questionStore.set(question.id, { ...question });
    }
  }

  return {
    users: createUserRepo(userStore),
    products: createProductRepo(productStore, asinStore),
    ownershipClaims: createOwnershipRepo(claimStore),
    questions: createQuestionRepo(questionStore),
    answers: createAnswerRepo(new Map()),
    helpfulVotes: createHelpfulVoteRepo(new Map()),
    reports: createReportRepo(new Map()),
    adminActions: createAdminActionRepo([]),
  };
}
