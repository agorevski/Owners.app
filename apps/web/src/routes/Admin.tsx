/**
 * Minimal admin console (routes `/admin/*`, docs/09 section 10).
 *
 * Four areas: product merge queue, verification review, moderation, and a metrics summary.
 * Every mutating action here writes an `admin_actions` audit row server-side.
 */

import { useState } from "react";
import { useApp } from "../state/AppStore";
import { useAsync } from "../state/useAsync";
import type { PendingClaimView, ReportView } from "../client/localClient";
import type { MetricsSummaryResponse } from "../server/admin";
import type { CanonicalProduct } from "@owners/shared";
import { ApiClientError } from "../client/localClient";
import { Badge, Button, Card, Message, Note, SectionHeading } from "../components/ui";
import { color, space } from "../ui/theme";

type Tab = "products" | "verifications" | "moderation" | "metrics";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "products", label: "Merges" },
  { key: "verifications", label: "Verifications" },
  { key: "moderation", label: "Moderation" },
  { key: "metrics", label: "Metrics" },
];

function useToast() {
  const [toast, setToast] = useState<{ tone: "verified" | "danger"; text: string } | undefined>();
  return { toast, setToast };
}

function MergeQueue() {
  const app = useApp();
  const { toast, setToast } = useToast();
  const provisional = useAsync(() => app.client.listProvisionalProducts(), [app.refreshKey]);
  const all = useAsync(() => app.client.listAllProducts(), [app.refreshKey]);
  const [targets, setTargets] = useState<Record<string, string>>({});

  const canonicalTargets = (all.data ?? []).filter((p: CanonicalProduct) => !p.provisional);

  async function merge(sourceId: string) {
    const targetId = targets[sourceId];
    if (!targetId) {
      setToast({ tone: "danger", text: "Pick a target canonical product first." });
      return;
    }
    try {
      const res = await app.client.mergeProducts(sourceId, targetId, "Admin console merge");
      setToast({ tone: "verified", text: `Merged: moved ${res.movedAsins} ASIN(s), ${res.movedQuestions} question(s).` });
      app.refresh();
    } catch (err) {
      setToast({ tone: "danger", text: err instanceof ApiClientError ? err.message : "Merge failed." });
    }
  }

  return (
    <Card>
      <SectionHeading sub="Provisional exact-ASIN products awaiting canonicalization.">
        Product merge queue
      </SectionHeading>
      {toast ? <Message tone={toast.tone}>{toast.text}</Message> : null}
      {(provisional.data ?? []).length === 0 ? (
        <Message tone="neutral">No provisional products to merge.</Message>
      ) : (
        (provisional.data ?? []).map((p: CanonicalProduct) => (
          <div key={p.id} style={{ padding: `${space(2)}px 0`, borderBottom: `1px solid ${color.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: space(2), flexWrap: "wrap" }}>
              <span style={{ color: color.ink, fontWeight: 600 }}>{p.title}</span>
              <Badge tone="warn" icon="ⓘ">
                Provisional
              </Badge>
            </div>
            <div style={{ display: "flex", gap: space(2), marginTop: space(2), flexWrap: "wrap", alignItems: "center" }}>
              <label htmlFor={`target-${p.id}`} style={{ fontSize: 13, color: color.body }}>
                Merge into:
              </label>
              <select
                id={`target-${p.id}`}
                value={targets[p.id] ?? ""}
                onChange={(e) => setTargets((t) => ({ ...t, [p.id]: e.target.value }))}
                style={{ minHeight: 40, padding: "6px 10px", borderRadius: 8, border: `1px solid ${color.line}` }}
              >
                <option value="">Select canonical product…</option>
                {canonicalTargets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.title}
                  </option>
                ))}
              </select>
              <Button onClick={() => merge(p.id)}>Merge</Button>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function VerificationReview() {
  const app = useApp();
  const { toast, setToast } = useToast();
  const pending = useAsync(() => app.client.listPendingClaims(), [app.refreshKey]);

  async function decide(claimId: string, decision: "approve" | "reject") {
    try {
      const res = await app.client.decideVerification(claimId, decision, `Admin ${decision}`);
      setToast({ tone: "verified", text: `Claim ${decision}d → ${res.status}.` });
      app.refresh();
    } catch (err) {
      setToast({ tone: "danger", text: err instanceof ApiClientError ? err.message : "Decision failed." });
    }
  }

  return (
    <Card>
      <SectionHeading sub="Ambiguous, exact-ASIN-only ownership claims.">Verification review</SectionHeading>
      {toast ? <Message tone={toast.tone}>{toast.text}</Message> : null}
      {(pending.data ?? []).length === 0 ? (
        <Message tone="neutral">No pending claims.</Message>
      ) : (
        (pending.data ?? []).map(({ claim, productTitle, ownerHandle }: PendingClaimView) => (
          <div key={claim.id} style={{ padding: `${space(2)}px 0`, borderBottom: `1px solid ${color.line}` }}>
            <div style={{ color: color.ink, fontWeight: 600 }}>{productTitle}</div>
            <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>
              @{ownerHandle} · ASIN {claim.asin} · confidence {claim.confidence}
              {claim.purchaseMonth ? ` · ${claim.purchaseMonth}` : ""}
            </div>
            <div style={{ display: "flex", gap: space(2), marginTop: space(2) }}>
              <Button onClick={() => decide(claim.id, "approve")}>Approve</Button>
              <Button variant="secondary" onClick={() => decide(claim.id, "reject")}>
                Reject
              </Button>
            </div>
          </div>
        ))
      )}
      <Note>Public views never expose the hashed order id or raw evidence — only lifecycle status.</Note>
    </Card>
  );
}

function Moderation() {
  const app = useApp();
  const { toast, setToast } = useToast();
  const reports = useAsync(() => app.client.listOpenReports(), [app.refreshKey]);

  async function act(view: ReportView, action: "hide" | "restore") {
    if (view.report.targetType === "user") {
      setToast({ tone: "danger", text: "User-target moderation is out of scope in v0." });
      return;
    }
    try {
      await app.client.moderate(view.report.targetType, view.report.targetId, action, view.report.id, `Admin ${action}`);
      setToast({ tone: "verified", text: `Content ${action === "hide" ? "hidden" : "restored"}.` });
      app.refresh();
    } catch (err) {
      setToast({ tone: "danger", text: err instanceof ApiClientError ? err.message : "Moderation failed." });
    }
  }

  return (
    <Card>
      <SectionHeading sub="Open reports. Hiding content resolves the report and writes an audit row.">
        Moderation queue
      </SectionHeading>
      {toast ? <Message tone={toast.tone}>{toast.text}</Message> : null}
      {(reports.data ?? []).length === 0 ? (
        <Message tone="neutral">No open reports.</Message>
      ) : (
        (reports.data ?? []).map((view: ReportView) => (
          <div key={view.report.id} style={{ padding: `${space(2)}px 0`, borderBottom: `1px solid ${color.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: space(2), flexWrap: "wrap" }}>
              <span style={{ color: color.ink }}>“{view.targetPreview}”</span>
              <Badge tone={view.hidden ? "warn" : "neutral"} icon={view.hidden ? "🚫" : "⚑"}>
                {view.report.targetType} · {view.hidden ? "hidden" : "visible"}
              </Badge>
            </div>
            <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>Reason: {view.report.reason}</div>
            <div style={{ display: "flex", gap: space(2), marginTop: space(2) }}>
              {view.hidden ? (
                <Button variant="secondary" onClick={() => act(view, "restore")}>
                  Restore
                </Button>
              ) : (
                <Button onClick={() => act(view, "hide")}>Hide</Button>
              )}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function MetricsPanel() {
  const app = useApp();
  const metrics = useAsync<MetricsSummaryResponse>(() => app.client.metrics(), [app.refreshKey]);
  if (metrics.loading || !metrics.data) return <Card>Loading metrics…</Card>;
  const m = metrics.data;
  const rows: Array<[string, string | number]> = [
    ["Products", m.products],
    ["Questions", m.questions],
    ["Answers", m.answers],
    ["Claims (total)", m.ownershipClaims.total],
    ["Claims verified", m.ownershipClaims.verified],
    ["Claims pending", m.ownershipClaims.pending],
    ["Verification pass rate", `${Math.round(m.verificationPassRate * 100)}%`],
    ["Reports open", m.reports.open],
    ["Commerce handoffs", m.handoffs],
    ["Analytics events", m.events.total],
    ["Admin actions", m.adminActions],
  ];
  return (
    <Card>
      <SectionHeading sub="Funnel and quality signals for the beta.">Metrics summary</SectionHeading>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: "6px 0", color: color.body, borderBottom: `1px solid ${color.line}` }}>{label}</td>
              <td style={{ padding: "6px 0", textAlign: "right", fontWeight: 700, color: color.ink, borderBottom: `1px solid ${color.line}` }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function Admin() {
  const app = useApp();
  const [tab, setTab] = useState<Tab>("products");
  const isAdmin = app.currentUser?.roles.includes("admin") ?? false;

  return (
    <div style={{ display: "grid", gap: space(4) }}>
      <Card>
        <SectionHeading sub="Product merges, verification review, moderation, and metrics.">
          Admin console
        </SectionHeading>
        {!isAdmin ? (
          <Message tone="warn">
            You're not signed in as an admin. Actions are still demoable, but in production these routes are role-gated.
          </Message>
        ) : null}
        <div role="tablist" style={{ display: "flex", gap: space(2), flexWrap: "wrap", marginTop: space(2) }}>
          {TABS.map((t) => (
            <Button key={t.key} variant={tab === t.key ? "primary" : "secondary"} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>
      </Card>

      {tab === "products" ? <MergeQueue /> : null}
      {tab === "verifications" ? <VerificationReview /> : null}
      {tab === "moderation" ? <Moderation /> : null}
      {tab === "metrics" ? <MetricsPanel /> : null}
    </div>
  );
}
