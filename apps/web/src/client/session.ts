/**
 * Email magic-link-style auth stub for the v0 prototype (docs/09 section 1 — "Email magic
 * link"; docs/01 lightweight auth).
 *
 * This is intentionally a local stub: there is no real email round-trip. Entering an email
 * "sends" a link that is auto-followed in-app, creating (or reusing) a pseudonymous account.
 * Public identity is a generated handle + verified badge only — a real name, email, or
 * Amazon order detail is NEVER surfaced publicly (docs/09 sections 1, 6; AC-S9).
 */

import type { User } from "@owners/shared";
import type { LocalApiClient } from "./localClient";

const ADJECTIVES = [
  "quiet",
  "brisk",
  "amber",
  "sunny",
  "calm",
  "swift",
  "teal",
  "bold",
  "lucky",
  "cosmic",
  "mellow",
  "clever",
];
const ANIMALS = [
  "otter",
  "finch",
  "lynx",
  "heron",
  "koala",
  "marten",
  "wren",
  "civet",
  "tapir",
  "ibis",
  "gecko",
  "quokka",
];

/** Small deterministic string hash so the same email maps to the same handle in a session. */
function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Generate a pseudonymous public handle from an email, never derived from the real name. */
export function pseudonymousHandle(email: string): string {
  const h = hashString(email.trim().toLowerCase());
  const adjective = ADJECTIVES[h % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length];
  const suffix = (h % 900) + 100;
  return `${adjective}-${animal}-${suffix}`;
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Session manager backed by the in-memory user repository. Maintains the email->user index
 * that the shared `UserRepository` intentionally does not model (v0 keeps the port minimal).
 */
export class SessionManager {
  private readonly client: LocalApiClient;
  private readonly emailIndex = new Map<string, string>();
  private current?: User;

  constructor(client: LocalApiClient) {
    this.client = client;
  }

  /** Pre-register a seeded account so its email can sign in and reuse the same identity. */
  registerAccount(user: User): void {
    if (user.email) this.emailIndex.set(user.email.trim().toLowerCase(), user.id);
  }

  get user(): User | undefined {
    return this.current;
  }

  /**
   * "Send" and auto-follow a magic link: find or create the pseudonymous account for the
   * email, mark it as the active principal, and return it.
   */
  async signIn(email: string): Promise<User> {
    if (!isValidEmail(email)) {
      throw new Error("Enter a valid email to receive a sign-in link.");
    }
    const key = email.trim().toLowerCase();
    const existingId = this.emailIndex.get(key);
    if (existingId) {
      const existing = await this.client.getUser(existingId);
      if (existing) {
        this.current = existing;
        this.client.setPrincipal(existing.id);
        return existing;
      }
    }

    const user: User = {
      id: crypto.randomUUID(),
      handle: pseudonymousHandle(email),
      email: key,
      roles: ["shopper"],
      createdAt: new Date().toISOString(),
    };
    await this.client.ctx.users.create(user);
    this.emailIndex.set(key, user.id);
    this.current = user;
    this.client.setPrincipal(user.id);
    return user;
  }

  signOut(): void {
    this.current = undefined;
    this.client.setPrincipal("anonymous");
  }
}
