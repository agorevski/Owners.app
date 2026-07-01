/**
 * In-memory WebRepositoryContext for local E2E and tests.
 *
 * Implements the shared storage-agnostic ports from `@owners/shared` plus the web-only
 * extensions in `context.ts`. The Vercel/Supabase target replaces this with a
 * Postgres-backed adapter that implements the same interfaces. Keep implementations simple
 * and free of cross-call side effects beyond the backing maps.
 */

import type {
  AdminAction,
  AmazonAsin,
  AnalyticsEvent,
  Answer,
  CanonicalProduct,
  HelpfulVote,
  HelpfulVoteRepository,
  OwnershipClaim,
  Question,
  Report,
  User,
  UserRepository,
  UUID,
} from "@owners/shared";
import type {
  AnalyticsEventRepository,
  ModerationRepository,
  ModerationTargetType,
  WebAdminActionRepository,
  WebAnswerRepository,
  WebOwnershipClaimRepository,
  WebProductRepository,
  WebQuestionRepository,
  WebReportRepository,
  WebRepositoryContext,
} from "./context";

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
  products: Map<UUID, CanonicalProduct & { mergedInto?: UUID }>,
  asins: Map<string, AmazonAsin>,
): WebProductRepository {
  async function findById(id: UUID): Promise<CanonicalProduct | null> {
    const product = products.get(id);
    if (!product) return null;
    // Do not leak the internal mergedInto marker to callers.
    const { mergedInto: _mergedInto, ...rest } = product;
    return rest;
  }
  return {
    findById,
    async findByAsin(asin) {
      const mapping = asins.get(asin);
      if (!mapping) return null;
      const product = await findById(mapping.canonicalProductId);
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
    async listAll() {
      return [...products.values()]
        .filter((p) => !p.mergedInto)
        .map(({ mergedInto: _mergedInto, ...rest }) => rest);
    },
    async listAsinsByProduct(canonicalProductId) {
      return [...asins.values()].filter((a) => a.canonicalProductId === canonicalProductId);
    },
    async relinkAsin(asin, toCanonicalProductId) {
      const mapping = asins.get(asin);
      if (!mapping) return null;
      const updated: AmazonAsin = { ...mapping, canonicalProductId: toCanonicalProductId };
      asins.set(asin, updated);
      return updated;
    },
    async markMerged(sourceId, targetId) {
      const product = products.get(sourceId);
      if (!product) return null;
      const updated = { ...product, mergedInto: targetId };
      products.set(sourceId, updated);
      const { mergedInto: _mergedInto, ...rest } = updated;
      return rest;
    },
  };
}

function createOwnershipRepo(store: Map<UUID, OwnershipClaim>): WebOwnershipClaimRepository {
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
      const updated: OwnershipClaim = {
        ...claim,
        status,
        verifiedAt: status === "verified" ? new Date().toISOString() : claim.verifiedAt,
      };
      store.set(id, updated);
      return updated;
    },
    async listAll() {
      return [...store.values()];
    },
  };
}

function createQuestionRepo(store: Map<UUID, Question>): WebQuestionRepository {
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
    async listAll() {
      return [...store.values()];
    },
    async updateStatus(id, status) {
      const question = store.get(id);
      if (!question) return null;
      const updated: Question = { ...question, status };
      store.set(id, updated);
      return updated;
    },
    async reassignProduct(fromCanonicalProductId, toCanonicalProductId) {
      let count = 0;
      for (const [id, q] of store) {
        if (q.canonicalProductId === fromCanonicalProductId) {
          store.set(id, { ...q, canonicalProductId: toCanonicalProductId });
          count += 1;
        }
      }
      return count;
    },
  };
}

function createAnswerRepo(store: Map<UUID, Answer>): WebAnswerRepository {
  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
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
      const updated: Answer = {
        ...answer,
        helpfulCount: Math.max(0, answer.helpfulCount + delta),
      };
      store.set(answerId, updated);
      return updated;
    },
    async listAll() {
      return [...store.values()];
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

function createReportRepo(store: Map<UUID, Report>): WebReportRepository {
  return {
    async create(report) {
      store.set(report.id, report);
      return report;
    },
    async listOpen() {
      return [...store.values()].filter((r) => r.status === "open");
    },
    async findById(id) {
      return store.get(id) ?? null;
    },
    async listAll() {
      return [...store.values()];
    },
    async updateStatus(id, status) {
      const report = store.get(id);
      if (!report) return null;
      const updated: Report = { ...report, status };
      store.set(id, updated);
      return updated;
    },
  };
}

function createAdminActionRepo(store: AdminAction[]): WebAdminActionRepository {
  return {
    async create(action) {
      store.push(action);
      return action;
    },
    async listAll() {
      return [...store];
    },
  };
}

function createAnalyticsEventRepo(store: AnalyticsEvent[]): AnalyticsEventRepository {
  return {
    async record(event) {
      store.push(event);
      return event;
    },
    async list() {
      return [...store];
    },
  };
}

function createModerationRepo(store: Set<string>): ModerationRepository {
  const key = (t: ModerationTargetType, id: UUID) => `${t}:${id}`;
  return {
    async hide(targetType, targetId) {
      store.add(key(targetType, targetId));
    },
    async restore(targetType, targetId) {
      store.delete(key(targetType, targetId));
    },
    async isHidden(targetType, targetId) {
      return store.has(key(targetType, targetId));
    },
  };
}

/**
 * Create a fresh in-memory WebRepositoryContext. Each call is fully isolated, which makes
 * it convenient for per-test setup.
 */
export function createInMemoryRepositories(): WebRepositoryContext {
  return {
    users: createUserRepo(new Map()),
    products: createProductRepo(new Map(), new Map()),
    ownershipClaims: createOwnershipRepo(new Map()),
    questions: createQuestionRepo(new Map()),
    answers: createAnswerRepo(new Map()),
    helpfulVotes: createHelpfulVoteRepo(new Map()),
    reports: createReportRepo(new Map()),
    adminActions: createAdminActionRepo([]),
    analyticsEvents: createAnalyticsEventRepo([]),
    moderation: createModerationRepo(new Set()),
  };
}
