/**
 * Owner verification (route `/owner/verify`).
 *
 * A web stand-in for the extension's user-initiated Amazon Orders scan: it explains the
 * evidence model, previews the exact minimal payload BEFORE submission, offers a cancel path,
 * submits via POST /api/ownership/claims, and shows the resulting claim status. Confident
 * (parent/variation-backed) evidence auto-verifies; exact-ASIN-only evidence stays pending
 * and routes to admin review.
 */

import { useState } from "react";
import type { SubmitOwnershipEvidenceRequest } from "@owners/shared";
import { useApp } from "../state/AppStore";
import { ApiClientError } from "../client/localClient";
import { Badge, Button, Card, Field, Message, Note, SectionHeading, TextInput } from "../components/ui";
import { VERIFICATION_CONSENT_BODY } from "../ui/disclosures";
import { color, space } from "../ui/theme";

type Phase = "idle" | "preview" | "submitted";

export function OwnerVerify() {
  const app = useApp();
  const [asin, setAsin] = useState("B0EARBUDS1");
  const [parentAsin, setParentAsin] = useState("B0PARENTA1");
  const [purchaseMonth, setPurchaseMonth] = useState("2025-11");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<{ status: string; claimId: string } | undefined>();
  const [error, setError] = useState<string | undefined>();

  function buildEvidence(): SubmitOwnershipEvidenceRequest {
    return {
      retailer: "amazon",
      marketplace: "US",
      asin: asin.trim().toUpperCase(),
      parentAsin: parentAsin.trim() ? parentAsin.trim().toUpperCase() : undefined,
      purchaseMonth: purchaseMonth.trim() || undefined,
      hashedOrderId: `sha256:${asin.trim().toUpperCase()}`,
      verificationMethod: "amazon_orders_user_initiated_scan",
      capturedAt: new Date().toISOString(),
      extensionVersion: "0.1.0",
    };
  }

  async function startScan() {
    setError(undefined);
    await app.client.recordEvent("owner_verification_started");
    await app.client.recordEvent("amazon_orders_scan_started");
    setPhase("preview");
  }

  async function submit() {
    setError(undefined);
    try {
      await app.client.recordEvent("ownership_claim_submitted", { asin: asin.trim().toUpperCase() });
      const res = await app.client.submitOwnershipClaim(buildEvidence());
      if (res.status === "verified") {
        await app.client.recordEvent("ownership_claim_approved", { asin: asin.trim().toUpperCase() });
      }
      setResult({ status: res.status, claimId: res.claimId });
      setPhase("submitted");
      app.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Submission failed.");
    }
  }

  if (!app.currentUser) {
    return (
      <Card>
        <SectionHeading>Verify earbuds you own</SectionHeading>
        <Message tone="warn">Sign in first — verification links a claim to your account.</Message>
        <Button onClick={() => app.navigate("home")} variant="secondary">
          Go to sign in
        </Button>
      </Card>
    );
  }

  const evidence = buildEvidence();

  return (
    <div style={{ display: "grid", gap: space(4) }}>
      <Card>
        <SectionHeading sub="User-initiated, credential-free, and minimal.">Verify earbuds you own</SectionHeading>
        <p style={{ color: color.body, lineHeight: 1.6 }}>{VERIFICATION_CONSENT_BODY}</p>
        <Field id="v-asin" label="Product ASIN" hint="Prefilled with the demo earbuds; edit to verify a different product.">
          <TextInput id="v-asin" value={asin} onChange={setAsin} />
        </Field>
        <Field id="v-parent" label="Parent / variation ASIN (optional)" hint="Present ⇒ confident match ⇒ auto-verify. Empty ⇒ pending admin review.">
          <TextInput id="v-parent" value={parentAsin} onChange={setParentAsin} />
        </Field>
        <Field id="v-month" label="Purchase month (YYYY-MM)" hint="A longevity signal — the exact day is never captured.">
          <TextInput id="v-month" value={purchaseMonth} onChange={setPurchaseMonth} />
        </Field>
        {phase === "idle" ? <Button onClick={startScan}>Scan my Amazon Orders</Button> : null}
        {error ? <Message tone="danger">{error}</Message> : null}
      </Card>

      {phase === "preview" ? (
        <Card>
          <SectionHeading sub="This is the entire payload — nothing else leaves your device.">
            Review evidence before submitting
          </SectionHeading>
          <pre
            style={{
              background: color.subtle,
              border: `1px solid ${color.line}`,
              borderRadius: 8,
              padding: space(3),
              overflowX: "auto",
              fontSize: 12,
            }}
          >
            {JSON.stringify(evidence, null, 2)}
          </pre>
          <div style={{ display: "flex", gap: space(2) }}>
            <Button onClick={submit}>Submit evidence</Button>
            <Button variant="ghost" onClick={() => setPhase("idle")}>
              Cancel
            </Button>
          </div>
          <Note>We never store your password, full order id, price, shipping address, or payment method.</Note>
        </Card>
      ) : null}

      {phase === "submitted" && result ? (
        <Card>
          <SectionHeading>Claim status</SectionHeading>
          {result.status === "verified" ? (
            <Badge tone="verified" icon="✔">
              Verified — you can now answer questions for this product
            </Badge>
          ) : (
            <Badge tone="warn" icon="…">
              Pending — routed to admin review (exact-ASIN match)
            </Badge>
          )}
          <Note>Claim id: {result.claimId}</Note>
          <div style={{ display: "flex", gap: space(2), marginTop: space(2) }}>
            <Button variant="secondary" onClick={() => app.navigate("ownerDashboard")}>
              Go to owner dashboard
            </Button>
            <Button variant="ghost" onClick={() => setPhase("idle")}>
              Verify another product
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
