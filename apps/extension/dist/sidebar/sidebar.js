"use strict";
(() => {
  // src/lib/disclosures.ts
  var DISCLOSURE_COPY_VERSION = "v0-2026-06";
  var HANDOFF_DISCLOSURE = "No affiliate tag in this v0. This opens the normal Amazon product page in a new tab.";
  var VERIFICATION_CONSENT_BODY = "Open your Amazon Orders page, then start the scan. Owners.app reads only visible earbud order rows to confirm ownership. We capture the product (ASIN), the purchase month, and a one-way hashed order id. We never read or store your Amazon password, full order id, price, shipping address, or payment method. You can review the evidence and cancel before anything is submitted.";
  var V0_PROVENANCE_NOTE = "Owners.app v0: answers come from verified owners only. AI answer generation is off in this build.";

  // src/lib/verification.ts
  var initialVerificationState = { phase: "idle" };
  function canSubmit(state2) {
    return state2.phase === "preview" && state2.evidence.length > 0;
  }
  function verificationReducer(state2, event) {
    switch (event.type) {
      case "START":
        return state2.phase === "idle" ? { phase: "explaining" } : state2;
      case "SCAN":
        return state2.phase === "explaining" ? { phase: "scanning" } : state2;
      case "SCAN_RESULT":
        return state2.phase === "scanning" ? { phase: "preview", evidence: event.evidence } : state2;
      case "CONFIRM_SUBMIT":
        return canSubmit(state2) ? { phase: "submitting", evidence: state2.evidence } : state2;
      case "SUBMITTED":
        return state2.phase === "submitting" ? { phase: "submitted", claimIds: event.claimIds } : state2;
      case "FAIL":
        return { phase: "error", message: event.message };
      case "CANCEL":
        if (state2.phase === "submitting" || state2.phase === "submitted") return state2;
        return { phase: "idle" };
      default:
        return state2;
    }
  }

  // src/sidebar/sidebar.ts
  function send(message) {
    return chrome.runtime.sendMessage(message);
  }
  function $(id) {
    return document.getElementById(id);
  }
  var state;
  var verify = initialVerificationState;
  function dispatch(event) {
    verify = verificationReducer(verify, event);
    renderVerify();
  }
  function renderProduct() {
    const titleEl = $("product-title");
    const verifiedEl = $("product-verified");
    if (state?.title || state?.resolved) {
      if (titleEl) titleEl.textContent = state.resolved?.title ?? state.title ?? state.asin;
      const hasQa = (state.qa?.questions.length ?? 0) > 0;
      verifiedEl?.classList.toggle("hidden", !hasQa);
    }
  }
  function renderQa(qa) {
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
        ans.textContent = `\u2714 Verified owner: ${a.body} (helpful ${a.helpfulCount})`;
        wrap.appendChild(ans);
      }
      list.appendChild(wrap);
    }
  }
  function renderVerify() {
    const preview = $("verify-preview");
    const evidenceEl = $("verify-evidence");
    const status = $("verify-status");
    const startBtn = $("verify-start");
    const showPreview = verify.phase === "preview" || verify.phase === "submitting";
    preview?.classList.toggle("hidden", !showPreview);
    if (startBtn) startBtn.disabled = verify.phase === "scanning" || verify.phase === "submitting";
    if (evidenceEl && showPreview && "evidence" in verify) {
      evidenceEl.textContent = JSON.stringify(verify.evidence, null, 2);
    }
    if (status) {
      const map = {
        idle: "",
        explaining: "Open your Amazon Orders page, then click Scan this page.",
        scanning: "Scanning visible earbud orders\u2026",
        preview: "Review the evidence below, then submit or cancel.",
        submitting: "Submitting\u2026",
        submitted: "Submitted. We'll enable your verified badge when the claim is approved.",
        error: verify.phase === "error" ? verify.message : ""
      };
      status.textContent = map[verify.phase];
    }
  }
  async function refreshState() {
    const res = await send({ type: "GET_PRODUCT_STATE" });
    if (res.ok) {
      state = res.data ?? void 0;
      renderProduct();
      renderQa(state?.qa);
    }
  }
  function wireAsk() {
    $("ask-submit")?.addEventListener("click", async () => {
      const body = $("ask-body")?.value.trim();
      const status = $("ask-status");
      if (!body) {
        if (status) status.textContent = "Please enter a question.";
        return;
      }
      if (!state?.resolved) {
        if (status) status.textContent = "No product resolved yet \u2014 open an Amazon earbud page first.";
        return;
      }
      const res = await send({
        type: "ASK_QUESTION",
        request: { canonicalProductId: state.resolved.canonicalProductId, body }
      });
      if (status) status.textContent = res.ok ? "Question sent to verified owners." : `Error: ${res.error}`;
    });
  }
  function wireVerify() {
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
      const res = await send({ type: "SUBMIT_EVIDENCE", evidence });
      if (res.ok) dispatch({ type: "SUBMITTED", claimIds: res.data?.claimIds ?? [] });
      else dispatch({ type: "FAIL", message: res.error });
    });
    $("verify-cancel")?.addEventListener("click", () => dispatch({ type: "CANCEL" }));
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === "ORDERS_SCAN_RESULT") {
        dispatch({ type: "SCAN_RESULT", evidence: message.evidence });
      }
    });
  }
  function wireHandoff() {
    $("handoff")?.addEventListener("click", async () => {
      if (!state?.asin) return;
      await send({ type: "COMMERCE_HANDOFF", asin: state.asin });
    });
  }
  function init() {
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
})();
//# sourceMappingURL=sidebar.js.map
