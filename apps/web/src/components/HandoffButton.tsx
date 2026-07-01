/**
 * Disclosed "Continue to Amazon" handoff button (docs/01 Flow S5, docs/09 section 8).
 *
 * v0 commerce posture: NO affiliate tag, NO link replacement, NO page reload. The button
 * opens the normal Amazon product page in a new tab, shows an inline disclosure BEFORE the
 * user leaves, and records a `commerce_handoff_clicked` event with the disclosure version.
 */

import { useApp } from "../state/AppStore";
import { Button, Note } from "./ui";
import { DISCLOSURE_COPY_VERSION, HANDOFF_DISCLOSURE } from "../ui/disclosures";
import { space } from "../ui/theme";

/** Clean canonical Amazon URL with no affiliate/attribution params. */
export function buildAmazonHandoffUrl(asin: string): string {
  return `https://www.amazon.com/dp/${encodeURIComponent(asin)}`;
}

export function HandoffButton({ asin }: { asin: string | undefined }) {
  const app = useApp();

  async function handoff() {
    if (!asin) return;
    // Disclosure is shown inline (below) BEFORE this click leaves for Amazon.
    await app.client.recordEvent("commerce_handoff_clicked", {
      asin,
      disclosureVersion: DISCLOSURE_COPY_VERSION,
    });
    if (typeof window !== "undefined") {
      window.open(buildAmazonHandoffUrl(asin), "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div style={{ marginTop: space(2) }}>
      <Button variant="secondary" onClick={handoff} disabled={!asin} aria-label="Continue to Amazon">
        Continue to Amazon ↗
      </Button>
      <Note>{HANDOFF_DISCLOSURE}</Note>
    </div>
  );
}
