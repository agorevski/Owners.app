// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppProvider } from "../state/AppStore";
import { ProductPage } from "./ProductPage";
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

function setTextArea(id: string, value: string) {
  const el = container.querySelector<HTMLTextAreaElement>(`[id="${id}"]`);
  if (!el) throw new Error(`textarea #${id} not found`);
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickComposerButton(questionId: string, label: string) {
  const scope = container.querySelector<HTMLElement>(`[id="composer-${questionId}"]`);
  if (!scope) throw new Error(`composer for ${questionId} not found`);
  const btn = Array.from(scope.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes(label),
  );
  if (!btn) throw new Error(`button not found in composer: ${label}`);
  (btn as HTMLButtonElement).click();
}

async function renderAsOwner(ownerEmail: string) {
  const client = new LocalApiClient();
  const session = new SessionManager(client);
  const seed = await seedDemoData(client, session);
  await session.signIn(ownerEmail);

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AppProvider
        client={client}
        session={session}
        seed={seed}
        initialNav={{ view: "product", params: { productId: seed.earbudsProductId } }}
      >
        <ProductPage />
      </AppProvider>,
    );
  });
  await settle();
  return { client, seed };
}

describe("ProductPage answer flow", () => {
  it("lets a verified owner post an answer to the open question", async () => {
    const { client, seed } = await renderAsOwner(seed_ownerEmail());
    setTextArea(`answer-${seed.openQuestionId}`, "Yes — the case supports Qi wireless charging.");
    await act(async () => clickComposerButton(seed.openQuestionId, "Post verified answer"));
    await settle();
    // After posting, the new answer is rendered on the (now answered) question.
    expect(container.textContent ?? "").toContain("Qi wireless charging");

    const view = await client.getProductView(seed.earbudsProductId);
    const open = view!.questions.find((q) => q.id === seed.openQuestionId)!;
    expect(open.answers.some((a) => a.body.includes("Qi wireless"))).toBe(true);
  });

  it("shows a clear ownership-required error when a non-owner tries to answer", async () => {
    // Sign in the shopper (no ownership) and try to answer.
    const client = new LocalApiClient();
    const session = new SessionManager(client);
    const seed = await seedDemoData(client, session);
    await session.signIn(seed.shopperUser.email!);

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <AppProvider
          client={client}
          session={session}
          seed={seed}
          initialNav={{ view: "product", params: { productId: seed.earbudsProductId } }}
        >
          <ProductPage />
        </AppProvider>,
      );
    });
    await settle();

    setTextArea(`answer-${seed.openQuestionId}`, "I don't actually own these.");
    await act(async () => clickComposerButton(seed.openQuestionId, "Post verified answer"));
    await settle();
    expect(container.textContent ?? "").toContain("Verified ownership of THIS product is required");
    await settle();
  });
});

// Seeded owner email is stable across runs.
function seed_ownerEmail(): string {
  return "owner@example.com";
}
