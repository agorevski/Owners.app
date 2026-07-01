/**
 * Cross-component test harness for the Owners.app v0 prototype.
 *
 * These helpers wire the REAL components together across workspace boundaries so the
 * integration/E2E suites exercise genuine contracts rather than mocks:
 *
 *  - `apps/extension` `OwnersApiClient` (the transport the MV3 service worker uses)
 *  - `apps/web` `handleApiRequest` router + domain handlers (`apps/web/src/server`)
 *  - `packages/shared` in-memory-backed `WebRepositoryContext`
 *
 * `createRouterFetch` adapts the extension client's `fetch` seam onto the web router, so a
 * request the extension makes (`POST /api/products/resolve`, `POST /api/ownership/claims`,
 * …) is dispatched through the exact same handlers the web app and server tests use, against
 * a single shared in-memory context. This is the "network" for the deterministic E2E.
 */

import type { User } from "@owners/shared";
import type { FetchLike } from "../../apps/extension/src/lib/api";
import { OwnersApiClient } from "../../apps/extension/src/lib/api";
import type { WebRepositoryContext } from "../../apps/web/src/server/context";
import { createInMemoryRepositories } from "../../apps/web/src/server/memoryRepositories";
import { handleApiRequest } from "../../apps/web/src/server/router";
import { LocalApiClient } from "../../apps/web/src/client/localClient";

/** Base URL used by the wired extension client; only the path portion matters. */
export const TEST_API_BASE = "http://owners.test/api";

/**
 * Adapt the extension `OwnersApiClient` fetch seam onto the web router.
 *
 * The bearer token added by `OwnersApiClient` (from `getAuthToken`) is treated as the
 * authenticated principal id, mirroring how a real session token maps to a user server-side.
 */
export function createRouterFetch(ctx: WebRepositoryContext): FetchLike {
  return async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers["authorization"] ?? headers["Authorization"];
    const principalId = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;

    const res = await handleApiRequest(ctx, {
      method,
      path: `${url.pathname}${url.search}`,
      body,
      ...(principalId ? { principalId } : {}),
    });

    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.body,
    } as unknown as Response;
  };
}

/**
 * Build an extension-side `OwnersApiClient` bound to a shared in-memory context and (optionally)
 * a principal. Use different principals to model the anonymous shopper vs. the signed-in owner.
 */
export function createWiredExtensionClient(
  ctx: WebRepositoryContext,
  principalId?: string,
): OwnersApiClient {
  return new OwnersApiClient({
    baseUrl: TEST_API_BASE,
    fetch: createRouterFetch(ctx),
    ...(principalId ? { getAuthToken: () => principalId } : {}),
  });
}

export interface TestUsers {
  owner: User;
  shopper: User;
  admin: User;
}

/** Create the standard cast of pseudonymous users used across the E2E suites. */
export async function seedUsers(ctx: WebRepositoryContext): Promise<TestUsers> {
  const now = new Date().toISOString();
  const owner: User = {
    id: crypto.randomUUID(),
    handle: "calm-otter-204",
    email: "owner@example.com",
    roles: ["owner", "shopper"],
    createdAt: now,
  };
  const shopper: User = {
    id: crypto.randomUUID(),
    handle: "swift-wren-158",
    email: "shopper@example.com",
    roles: ["shopper"],
    createdAt: now,
  };
  const admin: User = {
    id: crypto.randomUUID(),
    handle: "owners-admin",
    email: "admin@example.com",
    roles: ["admin", "moderator", "shopper"],
    createdAt: now,
  };
  await ctx.users.create(owner);
  await ctx.users.create(shopper);
  await ctx.users.create(admin);
  return { owner, shopper, admin };
}

/** A single shared context plus a web-side `LocalApiClient` bound to it. */
export interface Harness {
  ctx: WebRepositoryContext;
  web: LocalApiClient;
}

export function createHarness(): Harness {
  const ctx = createInMemoryRepositories();
  return { ctx, web: new LocalApiClient(ctx) };
}

export { createInMemoryRepositories, handleApiRequest, LocalApiClient };
