import { describe, expect, it } from "vitest";
import { LocalApiClient } from "./localClient";
import { SessionManager, isValidEmail, pseudonymousHandle } from "./session";

describe("pseudonymousHandle", () => {
  it("is deterministic and does not contain the email", () => {
    const handle = pseudonymousHandle("Person@Example.com");
    expect(handle).toBe(pseudonymousHandle("person@example.com"));
    expect(handle).not.toContain("person");
    expect(handle).toMatch(/^[a-z]+-[a-z]+-\d{3}$/);
  });
});

describe("isValidEmail", () => {
  it("accepts valid and rejects invalid", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
  });
});

describe("SessionManager — magic-link stub", () => {
  it("creates a pseudonymous account and sets it as the API principal", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const user = await session.signIn("shopper@example.com");
    expect(user.handle).toMatch(/-\d{3}$/);
    expect(user.roles).toContain("shopper");
    expect(session.user?.id).toBe(user.id);
  });

  it("reuses the same account for the same email", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const first = await session.signIn("owner@example.com");
    session.signOut();
    const second = await session.signIn("owner@example.com");
    expect(second.id).toBe(first.id);
  });

  it("rejects an invalid email", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    await expect(session.signIn("nope")).rejects.toThrow();
  });
});
