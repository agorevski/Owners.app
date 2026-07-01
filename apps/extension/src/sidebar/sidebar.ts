/**
 * Sidebar/popup UI (docs/03 Sidebar section, docs/01 Flow S5).
 *
 * Surfaces: detected product, existing Q&A, ask-question box, owner verification CTA with
 * consent + evidence preview + cancel-before-submit, disclosed "Continue to Amazon" handoff,
 * and clear v0 disclosures. All privileged work is delegated to the service worker.
 */

import type { ProductQuestionsResponse } from "@owners/shared";
import type { DetectedProductState, ExtensionMessage, ExtensionResponse } from "../lib/messages";
import {
  DISCLOSURE_COPY_VERSION,
  HANDOFF_DISCLOSURE,
  V0_PROVENANCE_NOTE,
  VERIFICATION_CONSENT_BODY,
} from "../lib/disclosures";
import {
  canSubmit,
  initialVerificationState,
  verificationReducer,
  type VerificationEvent,
  type VerificationState,
} from "../lib/verification";

function send<T = unknown>(message: ExtensionMessage): Promise<ExtensionResponse<T>> {
  return chrome.runtime.sendMessage(message) as Promise<ExtensionResponse<T>>;
}

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

let state: DetectedProductState | undefined;
let verify: VerificationState = initialVerificationState;

function dispatch(event: VerificationEvent): void {
  verify = verificationReducer(verify, event);
  renderVerify();
}

function renderProduct(): void {
  const titleEl = $("product-title");
  const verifiedEl = $("product-verified");
  if (state?.title || state?.resolved) {
    if (titleEl) titleEl.textContent = state.resolved?.title ?? state.title ?? state.asin;
    const hasQa = (state.qa?.questions.length ?? 0) > 0;
    verifiedEl?.classList.toggle("hidden", !hasQa);
  }
}

function renderQa(qa: ProductQuestionsResponse | undefined): void {
  const list = $("qa-list");
  if (!list) return;
  if (!qa || qa.questions.length === 0) return;
  list.innerHTML = "";
  for (const q of qa.questions) {
    const wrap = document.createElement("div");
    wrap.className = "qa";
    const question = document.createElement("p");
    question.textContent = q.body;
    wrap.appendChild(question);
    for (const a of q.answers) {
      const ans = document.createElement("p");
      ans.className = "muted";
      ans.textContent = `✔ Verified owner: ${a.body} (helpful ${a.helpfulCount})`;
      wrap.appendChild(ans);
    }
    list.appendChild(wrap);
  }
}

function renderVerify(): void {
  const preview = $("verify-preview");
  const evidenceEl = $("verify-evidence");
  const status = $("verify-status");
  const startBtn = $("verify-start") as HTMLButtonElement | null;

  const showPreview = verify.phase === "preview" || verify.phase === "submitting";
  preview?.classList.toggle("hidden", !showPreview);
  if (startBtn) startBtn.disabled = verify.phase === "scanning" || verify.phase === "submitting";

  if (evidenceEl && showPreview && "evidence" in verify) {
    evidenceEl.textContent = JSON.stringify(verify.evidence, null, 2);
  }
  if (status) {
    const map: Record<VerificationState["phase"], string> = {
      idle: "",
      explaining: "Open your Amazon Orders page, then click Scan this page.",
      scanning: "Scanning visible earbud orders…",
      preview: "Review the evidence below, then submit or cancel.",
      submitting: "Submitting…",
      submitted: "Submitted. We'll enable your verified badge when the claim is approved.",
      error: verify.phase === "error" ? verify.message : "",
    };
    status.textContent = map[verify.phase];
  }
}

async function refreshState(): Promise<void> {
  const res = await send<DetectedProductState | undefined>({ type: "GET_PRODUCT_STATE" });
  if (res.ok) {
    state = res.data ?? undefined;
    renderProduct();
    renderQa(state?.qa);
  }
}

function wireAsk(): void {
  $("ask-submit")?.addEventListener("click", async () => {
    const body = ($("ask-body") as HTMLTextAreaElement | null)?.value.trim();
    const status = $("ask-status");
    if (!body) {
      if (status) status.textContent = "Please enter a question.";
      return;
    }
    if (!state?.resolved) {
      if (status) status.textContent = "No product resolved yet — open an Amazon earbud page first.";
      return;
    }
    const res = await send({
      type: "ASK_QUESTION",
      request: { canonicalProductId: state.resolved.canonicalProductId, body },
    });
    if (status) status.textContent = res.ok ? "Question sent to verified owners." : `Error: ${res.error}`;
  });
}

function wireVerify(): void {
  $("verify-start")?.addEventListener("click", async () => {
    if (verify.phase === "idle") {
      dispatch({ type: "START" });
      await send({ type: "START_ORDERS_SCAN" });
      dispatch({ type: "SCAN" });
    }
  });
  $("verify-confirm")?.addEventListener("click", async () => {
    if (!canSubmit(verify) || !("evidence" in verify)) return;
    const evidence = verify.evidence;
    dispatch({ type: "CONFIRM_SUBMIT" });
    const res = await send<{ claimIds: string[] }>({ type: "SUBMIT_EVIDENCE", evidence });
    if (res.ok) dispatch({ type: "SUBMITTED", claimIds: res.data?.claimIds ?? [] });
    else dispatch({ type: "FAIL", message: res.error });
  });
  $("verify-cancel")?.addEventListener("click", () => dispatch({ type: "CANCEL" }));

  // The injected scanner posts ORDERS_SCAN_RESULT; move the flow into preview (no auto-submit).
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "ORDERS_SCAN_RESULT") {
      dispatch({ type: "SCAN_RESULT", evidence: message.evidence });
    }
  });
}

function wireHandoff(): void {
  $("handoff")?.addEventListener("click", async () => {
    if (!state?.asin) return;
    await send({ type: "COMMERCE_HANDOFF", asin: state.asin });
  });
}

function init(): void {
  const consent = $("verify-copy");
  if (consent) consent.textContent = VERIFICATION_CONSENT_BODY;
  const handoffDisclosure = $("handoff-disclosure");
  if (handoffDisclosure) handoffDisclosure.textContent = HANDOFF_DISCLOSURE;
  const v0 = $("v0-disclosure");
  if (v0) v0.textContent = `${V0_PROVENANCE_NOTE} Disclosure ${DISCLOSURE_COPY_VERSION}.`;

  wireAsk();
  wireVerify();
  wireHandoff();
  void send({ type: "OPEN_SIDEBAR" });
  void refreshState();
  renderVerify();
}

if (typeof document !== "undefined" && typeof chrome !== "undefined" && chrome.runtime?.id) {
  init();
}
