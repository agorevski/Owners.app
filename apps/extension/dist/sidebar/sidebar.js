"use strict";
(() => {
  // src/sidebar/sidebar.ts
  var verifyButton = document.getElementById("verify");
  var status = document.getElementById("status");
  verifyButton?.addEventListener("click", () => {
    const message = { type: "START_ORDERS_SCAN" };
    chrome.runtime.sendMessage(message).then(() => {
      if (status) {
        status.textContent = "Open your Amazon Orders page, then confirm the scan.";
      }
    });
  });
})();
//# sourceMappingURL=sidebar.js.map
