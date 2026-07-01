# Owners.app — Verified Owners Platform

**Ask someone who actually owns it — right where you're about to buy.**

Owners.app is a browser extension and community platform that connects shoppers to
**verified product owners** who can answer real, specific questions at the moment of
purchase intent. Instead of guessing from anonymous star ratings and gameable reviews,
a shopper looking at a product page can ask "Will this fit my setup?" or "Does it still
work after 18 months?" and get a trustworthy answer from someone who demonstrably owns
the product — and helpful owners are rewarded for their contributions.

## The product goal

- **For shoppers:** get credible, specific, current answers to high-consideration
  purchase questions from people with proven, lived experience.
- **For owners/contributors:** be recognized and **rewarded from compliant
  commerce revenue** for answering well and honestly.
- **The durable asset:** a continuously-refreshed **Product Ownership Knowledge Graph
  (POKG)** linking real, verified owners to the questions, answers, and lived-experience
  facts they contribute — a data moat incumbents can't easily replicate.

## How it works (high level)

Owners.app deliberately separates concerns that most "review" products conflate:

1. **Discovery (the wedge):** a **browser extension** that activates on retail product
   pages in a few high-consideration categories and surfaces "Ask a verified owner."
   This acquires demand cheaply at the point of intent — it is the entry point, not the
   product.
2. **Verified ownership:** cheap, private, fraud-resistant **ownership verification** so
   answers come from people with a proven relationship to the product.
3. **Community Q&A:** a **community website** where shoppers ask and verified owners
   answer, building durable, category-scoped reputation.
4. **Product Knowledge Graph:** conversations are converted into a structured, queryable
   **POKG** so knowledge compounds and is reusable.
5. **AI summaries & search:** an **AI layer** does retrieval and summarization grounded
   in verified ownership data — most shoppers get instant answers from prior content;
   only novel questions route to live owners. AI never fabricates ownership or opinions.
6. **Compliant commerce handoff:** a deliberately **thin commerce layer** hands off to
   retailers via retailer-approved affiliate/partner links, funding contributor rewards.
7. **Trust, fraud, privacy & compliance layers:** reputation, fraud prevention and
   moderation, data minimization, privacy/security, and legal compliance keep answer
   integrity — the core asset — intact.

### A note on affiliate compliance

Monetization is intentionally the thinnest layer in the system. Owners.app is **never**
a merchant of record, payment processor, or price/inventory source of truth — it hands
off to retailers and payment providers. It uses **only** affiliate mechanics that a
retailer's own program explicitly authorizes ("technically possible" ≠ "permitted"),
and affiliate relationships, sponsorships, and AI-generated content are **disclosed at
the point of consumption**, not buried in a policy page. Revenue-in (affiliate) and
money-out (contributor payouts) are kept on separate ledgers so a problem in one cannot
corrupt the other.

## Documentation map

The full design is split into a working set of docs under `docs/`. These split docs are
the **primary working set**; start here:

| Doc | Topic |
|-----|-------|
| [`docs/01-user-persona-flows.md`](docs/01-user-persona-flows.md) | Shopper (Chrome plugin) flow and verified owner/contributor flow |
| [`docs/02-foundation-and-components.md`](docs/02-foundation-and-components.md) | Foundation, strategy, goals, principles, component map, metrics |
| [`docs/03-ux-extension-and-community.md`](docs/03-ux-extension-and-community.md) | Browser extension UX, community website, chat, onboarding, dashboards, accessibility |
| [`docs/04-architecture-data-and-apis.md`](docs/04-architecture-data-and-apis.md) | Architecture, services, data, APIs, events, deployment/operations |
| [`docs/05-trust-verification-incentives-and-fraud.md`](docs/05-trust-verification-incentives-and-fraud.md) | Verification, trust/reputation, incentives, fraud, moderation |
| [`docs/06-ai-and-product-knowledge-graph.md`](docs/06-ai-and-product-knowledge-graph.md) | Product knowledge graph, AI, RAG/search, recommendations, reliability intelligence |
| [`docs/07-commerce-privacy-security-and-legal.md`](docs/07-commerce-privacy-security-and-legal.md) | Commerce, affiliate/partner risks, privacy, security, legal/compliance |
| [`docs/08-roadmap-operations-risks-and-backlog.md`](docs/08-roadmap-operations-risks-and-backlog.md) | Roadmap, GTM, operations, risk register, open questions, backlog |
| [`docs/09-mvp-implementation-spec.md`](docs/09-mvp-implementation-spec.md) | Locked v0 implementation decisions: Amazon.com earbuds, Chrome MV3, verification, stack, deferred systems |

> If it still exists, the original mega seed document remains at
> [`OWNERS_APP_PRODUCT_DESIGN.md`](OWNERS_APP_PRODUCT_DESIGN.md) for reference, but the
> split docs above are the primary working set.

## Status

Early-stage product design with a clarified v0 target. The MVP starts with **Amazon.com earbuds**,
a **Chrome Manifest V3** extension, **email magic link** accounts, **user-initiated Amazon Orders
verification**, and a **safe non-affiliate Amazon handoff** while commerce approval is unresolved.
AI/RAG, automated payouts, graph/vector infrastructure, and multi-retailer support are deferred.
