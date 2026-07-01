"use strict";
(() => {
  // src/lib/api.ts
  var DEFAULT_API_BASE = "http://localhost:5173/api";
  var OwnersApiClient = class {
    baseUrl;
    fetchImpl;
    getAuthToken;
    constructor(options = {}) {
      this.baseUrl = (options.baseUrl ?? DEFAULT_API_BASE).replace(/\/$/, "");
      this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
      this.getAuthToken = options.getAuthToken;
    }
    async request(path, init) {
      const headers = { "content-type": "application/json" };
      const token = this.getAuthToken?.();
      if (token) headers["authorization"] = `Bearer ${token}`;
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...headers, ...init?.headers }
      });
      if (!res.ok) {
        throw new Error(`Owners.app API ${path} failed: ${res.status}`);
      }
      return await res.json();
    }
    // POST /api/products/resolve
    resolveProduct(req) {
      return this.request("/products/resolve", { method: "POST", body: JSON.stringify(req) });
    }
    // GET /api/products/:id/questions
    listQuestions(canonicalProductId) {
      return this.request(`/products/${encodeURIComponent(canonicalProductId)}/questions`);
    }
    // POST /api/questions
    createQuestion(req) {
      return this.request("/questions", { method: "POST", body: JSON.stringify(req) });
    }
    // POST /api/answers (requires verified ownership claim)
    createAnswer(req) {
      return this.request("/answers", { method: "POST", body: JSON.stringify(req) });
    }
    // POST /api/ownership/claims
    submitOwnershipEvidence(req) {
      return this.request("/ownership/claims", { method: "POST", body: JSON.stringify(req) });
    }
    // GET /api/ownership/claims/:id
    getClaimStatus(claimId) {
      return this.request(`/ownership/claims/${encodeURIComponent(claimId)}`);
    }
    // POST /api/feedback/helpful
    markHelpful(req) {
      return this.request("/feedback/helpful", { method: "POST", body: JSON.stringify(req) });
    }
    // POST /api/reports
    createReport(req) {
      return this.request("/reports", { method: "POST", body: JSON.stringify(req) });
    }
    // POST /api/events
    postEvent(name, props) {
      return this.request("/events", {
        method: "POST",
        body: JSON.stringify({ name, props, occurredAt: (/* @__PURE__ */ new Date()).toISOString() })
      });
    }
  };

  // src/lib/handoff.ts
  var AMAZON_ORIGIN = "https://www.amazon.com";
  function buildAmazonHandoffUrl(asin) {
    return `${AMAZON_ORIGIN}/dp/${encodeURIComponent(asin)}`;
  }

  // src/lib/disclosures.ts
  var DISCLOSURE_COPY_VERSION = "v0-2026-06";

  // src/lib/messages.ts
  function isExtensionMessage(value) {
    if (typeof value !== "object" || value === null) return false;
    const type = value.type;
    return typeof type === "string" && [
      "PRODUCT_DETECTED",
      "OPEN_SIDEBAR",
      "GET_PRODUCT_STATE",
      "ASK_QUESTION",
      "START_ORDERS_SCAN",
      "ORDERS_SCAN_RESULT",
      "SUBMIT_EVIDENCE",
      "MARK_HELPFUL",
      "REPORT",
      "COMMERCE_HANDOFF",
      "ANALYTICS"
    ].includes(type);
  }

  // src/background/service-worker.ts
  var STATE_KEY = "owners.detectedProduct";
  var api = new OwnersApiClient({ baseUrl: DEFAULT_API_BASE });
  async function setState(state) {
    await chrome.storage.session.set({ [STATE_KEY]: state ?? null });
  }
  async function getState() {
    const stored = await chrome.storage.session.get(STATE_KEY);
    return stored[STATE_KEY] ?? void 0;
  }
  async function emit(name, props) {
    try {
      await api.postEvent(name, props);
    } catch {
    }
  }
  async function handleProductDetected(msg) {
    await emit("amazon_product_detected", { asin: msg.asin });
    const state = { asin: msg.asin, parentAsin: msg.parentAsin, title: msg.title };
    try {
      const resolved = await api.resolveProduct({
        asin: msg.asin,
        parentAsin: msg.parentAsin,
        title: msg.title,
        marketplace: "US"
      });
      state.resolved = resolved;
      try {
        state.qa = await api.listQuestions(resolved.canonicalProductId);
      } catch {
      }
    } catch {
    }
    await setState(state);
  }
  async function startOrdersScan() {
    await emit("owner_verification_started");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await emit("amazon_orders_scan_started");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/orders.js"]
    });
  }
  async function submitEvidence(evidence) {
    const claimIds = [];
    for (const item of evidence) {
      await emit("ownership_claim_submitted", { asin: item.asin });
      const res = await api.submitOwnershipEvidence(item);
      claimIds.push(res.claimId);
      if (res.status === "verified") {
        await emit("ownership_claim_approved", { asin: item.asin });
      }
    }
    return claimIds;
  }
  async function route(message) {
    switch (message.type) {
      case "PRODUCT_DETECTED":
        await handleProductDetected(message);
        return { ok: true };
      case "OPEN_SIDEBAR":
        await emit("sidebar_opened");
        return { ok: true };
      case "GET_PRODUCT_STATE":
        return { ok: true, data: await getState() };
      case "ASK_QUESTION": {
        await emit("question_started");
        const created = await api.createQuestion(message.request);
        await emit("question_submitted");
        return { ok: true, data: created };
      }
      case "START_ORDERS_SCAN":
        await startOrdersScan();
        return { ok: true };
      case "ORDERS_SCAN_RESULT":
        return { ok: true, data: message.evidence };
      case "SUBMIT_EVIDENCE": {
        const claimIds = await submitEvidence(message.evidence);
        return { ok: true, data: { claimIds } };
      }
      case "MARK_HELPFUL":
        await api.markHelpful({ answerId: message.answerId, helpful: message.helpful });
        await emit("answer_marked_helpful", { answerId: message.answerId });
        return { ok: true };
      case "REPORT":
        await api.createReport({ targetType: message.targetType, targetId: message.targetId, reason: message.reason });
        await emit("content_reported", { targetType: message.targetType });
        return { ok: true };
      case "COMMERCE_HANDOFF": {
        const url = buildAmazonHandoffUrl(message.asin);
        await emit("commerce_handoff_clicked", { asin: message.asin, disclosureVersion: DISCLOSURE_COPY_VERSION });
        await chrome.tabs.create({ url });
        return { ok: true, data: { url } };
      }
      case "ANALYTICS":
        await emit(message.name, message.props);
        return { ok: true };
      default:
        return { ok: false, error: "Unknown message" };
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!isExtensionMessage(message)) {
      sendResponse({ ok: false, error: "Invalid message" });
      return false;
    }
    route(message).then(sendResponse).catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  });
  chrome.runtime.onInstalled?.addListener(() => {
    void emit("extension_installed");
  });
})();
//# sourceMappingURL=service-worker.js.map
