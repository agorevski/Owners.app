// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppProvider } from "../state/AppStore";
import { Admin } from "./Admin";
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

function findButton(label: string): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(label),
  );
  if (!btn) throw new Error(`Button not found: ${label}`);
  return btn as HTMLButtonElement;
}

async function render(seed: Awaited<ReturnType<typeof seedDemoData>>, client: LocalApiClient, session: SessionManager) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider client={client} session={session} seed={seed} initialNav={{ view: "admin", params: {} }}>
        <Admin />
      </AppProvider>,
    );
  });
  await settle();
}

describe("Admin console", () => {
  it("shows the provisional product in the merge queue", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const seed = await seedDemoData(client, session);
    await render(seed, client, session);
    expect(container.textContent ?? "").toContain("Product merge queue");
    expect(container.textContent ?? "").toContain("provisional");
  });

  it("approves a pending verification claim from the review tab", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const seed = await seedDemoData(client, session);
    await render(seed, client, session);

    await act(async () => findButton("Verifications").click());
    await settle();
    expect(container.textContent ?? "").toContain("Verification review");

    await act(async () => findButton("Approve").click());
    await settle();
    expect(container.textContent ?? "").toContain("verified");
    expect(await client.listPendingClaims()).toHaveLength(0);
  });

  it("renders the metrics summary tab", async () => {
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const seed = await seedDemoData(client, session);
    await render(seed, client, session);

    await act(async () => findButton("Metrics").click());
    await settle();
    const text = container.textContent ?? "";
    expect(text).toContain("Metrics summary");
    expect(text).toContain("Verification pass rate");
    expect(text).toContain("Commerce handoffs");
  });
});
