// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppProvider } from "../state/AppStore";
import { OwnerDashboard } from "./OwnerDashboard";
import { LocalApiClient } from "../client/localClient";
import { SessionManager } from "../client/session";
import { seedDemoData } from "../client/seed";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("OwnerDashboard", () => {
  it("shows recognition metrics (no cash) for a signed-in verified owner", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const seed = await seedDemoData(client, session);
    // Sign the verified owner in so the dashboard has a principal.
    await session.signIn(seed.ownerUser.email!);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <AppProvider client={client} session={session} seed={seed} initialNav={{ view: "ownerDashboard", params: {} }}>
          <OwnerDashboard />
        </AppProvider>,
      );
    });
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain("Owner dashboard");
    expect(text).toContain("Questions answered");
    expect(text).toContain("Helpful votes");
    expect(text).toContain("Verified products");
    expect(text).toContain("Top helper"); // owner is the only helper => top helper
    expect(text).toContain("Recognition only"); // recognition, not earnings
    // No dark patterns / cash earnings language.
    expect(text.toLowerCase()).not.toContain("earnings:");
    expect(text).not.toContain("$");
  });

  it("prompts sign-in when signed out", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const seed = await seedDemoData(client, session);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <AppProvider client={client} session={session} seed={seed} initialNav={{ view: "ownerDashboard", params: {} }}>
          <OwnerDashboard />
        </AppProvider>,
      );
    });
    await settle();

    expect(container.textContent ?? "").toContain("Sign in to see your verified products");
  });
});
