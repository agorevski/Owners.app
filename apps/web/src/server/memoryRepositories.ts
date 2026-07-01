import type {
  AdminAction,
  AdminActionRepository,
  AmazonAsin,
  Answer,
  AnswerRepository,
  CanonicalProduct,
  HelpfulVote,
  HelpfulVoteRepository,
  OwnershipClaim,
  OwnershipClaimRepository,
  ProductRepository,
  Question,
  QuestionRepository,
  Report,
  ReportRepository,
  RepositoryContext,
  User,
  UserRepository,
  UUID,
} from "@owners/shared";

/**
 * In-memory RepositoryContext for local E2E and tests.
 *
 * The Vercel/Supabase target replaces this with a Postgres-backed adapter that implements
 * the same interfaces from @owners/shared. Keep this simple and side-effect free per call.
 */

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

export function createInMemoryRepositories(): RepositoryContext {
  return {
    users: createUserRepo(new Map()),
    products: createProductRepo(new Map(), new Map()),
    ownershipClaims: createOwnershipRepo(new Map()),
    questions: createQuestionRepo(new Map()),
    answers: createAnswerRepo(new Map()),
    helpfulVotes: createHelpfulVoteRepo(new Map()),
    reports: createReportRepo(new Map()),
    adminActions: createAdminActionRepo([]),
  };
}
