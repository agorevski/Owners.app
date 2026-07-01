// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppProvider } from "../state/AppStore";
import { ProductPage } from "./ProductPage";
import { LocalApiClient } from "../client/localClient";
import { SessionManager } from "../client/session";
import { seedDemoData } from "../client/seed";

// React 18 concurrent act flag.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderProduct() {
  const client = new LocalApiClient();
  const session = new SessionManager(client);
  const seed = await seedDemoData(client, session);

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
  // allow the product-view load to settle
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return seed;
}

describe("ProductPage", () => {
  it("renders the resolved earbuds product with provenance and prior Q&A", async () => {
    await renderProduct();
    const text = container.textContent ?? "";
    expect(text).toContain("AirBeats");
    expect(text).toContain("verified owner"); // provenance summary ("1 verified owner")
    expect(text).toContain("Verified owner"); // provenance label on the answer
    expect(text).toContain("Ask the owners"); // ask flow present
    expect(text).toContain("Continue to Amazon"); // disclosed handoff
    expect(text).toContain("No affiliate tag"); // handoff disclosure copy
  });

  it("shows the awaiting-owner state for the open question", async () => {
    await renderProduct();
    const text = container.textContent ?? "";
    expect(text).toContain("Awaiting owner");
  });
});
