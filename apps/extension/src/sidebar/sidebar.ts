/**
 * Sidebar/popup UI script.
 *
 * v0 scaffold: shows a calm entry point and a verification start button. UI agents should
 * expand this into the full Q&A + verification surface described in docs/03.
 *
 * TODO(extension-agent): render resolved product Q&A, ask flow, and claim status.
 */

import type { ExtensionMessage } from "../lib/messages";

const verifyButton = document.getElementById("verify");
const status = document.getElementById("status");

verifyButton?.addEventListener("click", () => {
  const message: ExtensionMessage = { type: "START_ORDERS_SCAN" };
  chrome.runtime.sendMessage(message).then(() => {
    if (status) {
      status.textContent = "Open your Amazon Orders page, then confirm the scan.";
    }
  });
});
