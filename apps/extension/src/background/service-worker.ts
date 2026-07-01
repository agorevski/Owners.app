/**
 * MV3 service worker (background) — message bus + API orchestration (docs/09 sections 5 & 7).
 *
 * Responsibilities (v0):
 *  - Resolve canonical products from PRODUCT_DETECTED and cache the sidebar-facing state.
 *  - Orchestrate the user-initiated Amazon Orders scan by injecting content/orders.js only
 *    after an explicit START_ORDERS_SCAN (never automatically).
 *  - Proxy sidebar actions (ask, submit evidence, helpful, report, handoff) to the API.
 *  - Emit the MVP funnel analytics events.
 *
 * Auth (email magic link) and the API base URL are configurable via chrome.storage; the
 * client defaults to the local dev API. Secrets stay in the worker, never in page context.
 */

import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";
import { OwnersApiClient, DEFAULT_API_BASE } from "../lib/api";
import { buildAmazonHandoffUrl } from "../lib/handoff";
import { DISCLOSURE_COPY_VERSION } from "../lib/disclosures";
import {
  isExtensionMessage,
  type DetectedProductState,
  type ExtensionMessage,
  type ExtensionResponse,
} from "../lib/messages";

const STATE_KEY = "owners.detectedProduct";

const api = new OwnersApiClient({ baseUrl: DEFAULT_API_BASE });

async function setState(state: DetectedProductState | undefined): Promise<void> {
  await chrome.storage.session.set({ [STATE_KEY]: state ?? null });
}

async function getState(): Promise<DetectedProductState | undefined> {
  const stored = await chrome.storage.session.get(STATE_KEY);
  return (stored[STATE_KEY] as DetectedProductState | null) ?? undefined;
}

async function emit(name: Parameters<OwnersApiClient["postEvent"]>[0], props?: Record<string, string | number | boolean | null>): Promise<void> {
  try {
    await api.postEvent(name, props);
  } catch {
    /* Analytics are best-effort in v0. */
  }
}

async function handleProductDetected(msg: Extract<ExtensionMessage, { type: "PRODUCT_DETECTED" }>): Promise<void> {
  await emit("amazon_product_detected", { asin: msg.asin });
  const state: DetectedProductState = { asin: msg.asin, parentAsin: msg.parentAsin, title: msg.title };
  try {
    const resolved = await api.resolveProduct({
      asin: msg.asin,
      parentAsin: msg.parentAsin,
      title: msg.title,
      marketplace: "US",
    });
    state.resolved = resolved;
    try {
      state.qa = await api.listQuestions(resolved.canonicalProductId);
    } catch {
      /* No Q&A yet is a valid cold-start state. */
    }
  } catch {
    /* API offline: keep the raw detection so the sidebar can still offer to ask. */
  }
  await setState(state);
}

/** Inject the Orders scanner into the active tab AFTER explicit user action only. */
async function startOrdersScan(): Promise<void> {
  await emit("owner_verification_started");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await emit("amazon_orders_scan_started");
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content/orders.js"],
  });
}

async function submitEvidence(evidence: SubmitOwnershipEvidenceRequest[]): Promise<string[]> {
  const claimIds: string[] = [];
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

async function route(message: ExtensionMessage): Promise<ExtensionResponse> {
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
      // The scanner posts results; the sidebar reads them from the preview flow. We cache
      // nothing sensitive here — evidence is already minimized and only forwarded on submit.
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse: (r: ExtensionResponse) => void) => {
  if (!isExtensionMessage(message)) {
    sendResponse({ ok: false, error: "Invalid message" });
    return false;
  }
  route(message)
    .then(sendResponse)
    .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
  return true; // async response
});

chrome.runtime.onInstalled?.addListener(() => {
  void emit("extension_installed");
});
