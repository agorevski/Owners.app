/**
 * Owner dashboard (route `/owner/dashboard`).
 *
 * Recognition-only (docs/09 section 8, AC-DB1): verified products, the routed-question inbox,
 * and recognition metrics (answered, helpful votes received, top-helper). No dollar earnings —
 * any future payout program is labeled as deferred.
 */

import { useApp } from "../state/AppStore";
import { useAsync } from "../state/useAsync";
import type { OwnerDashboardView } from "../client/localClient";
import { Badge, Button, Card, Message, Note, SectionHeading } from "../components/ui";
import { RECOGNITION_NOTE } from "../ui/disclosures";
import { color, space } from "../ui/theme";

function Metric({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div style={{ background: color.subtle, borderRadius: 8, padding: space(3), minWidth: 120 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color.ink }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>
          {icon}
        </span>
        {value}
      </div>
      <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

export function OwnerDashboard() {
  const app = useApp();
  const state = useAsync<OwnerDashboardView | null>(
    () => (app.currentUser ? app.client.getOwnerDashboard(app.currentUser.id) : Promise.resolve(null)),
    [app.currentUser?.id, app.refreshKey],
  );

  if (!app.currentUser) {
    return (
      <Card>
        <SectionHeading>Owner dashboard</SectionHeading>
        <Message tone="warn">Sign in to see your verified products and recognition.</Message>
        <Button variant="secondary" onClick={() => app.navigate("home")}>
          Go to sign in
        </Button>
      </Card>
    );
  }
  if (state.loading || !state.data) return <Card>Loading dashboard…</Card>;

  const d = state.data;

  return (
    <div style={{ display: "grid", gap: space(4) }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: space(2), flexWrap: "wrap" }}>
          <SectionHeading sub={`Signed in as @${d.handle}`}>Owner dashboard</SectionHeading>
          {d.isTopHelper ? (
            <Badge tone="verified" icon="★">
              Top helper — earbuds beta
            </Badge>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: space(2), flexWrap: "wrap" }}>
          <Metric label="Questions answered" value={d.answersGiven} icon="💬" />
          <Metric label="Helpful votes" value={d.helpfulReceived} icon="👍" />
          <Metric label="Verified products" value={d.verifiedProducts.length} icon="✔" />
        </div>
        <Note>{RECOGNITION_NOTE}</Note>
      </Card>

      <Card>
        <SectionHeading>Your verified products</SectionHeading>
        {d.verifiedProducts.length === 0 ? (
          <Message tone="neutral">
            No verified products yet.{" "}
            <button
              onClick={() => app.navigate("ownerVerify")}
              style={{ background: "none", border: "none", color: color.accent, cursor: "pointer", padding: 0, font: "inherit", textDecoration: "underline" }}
            >
              Verify one now
            </button>
            .
          </Message>
        ) : (
          d.verifiedProducts.map(({ product, claim }) => (
            <div
              key={product.id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: space(2), padding: `${space(2)}px 0`, borderBottom: `1px solid ${color.line}`, flexWrap: "wrap" }}
            >
              <div>
                <div style={{ fontWeight: 600, color: color.ink }}>{product.title}</div>
                <div style={{ fontSize: 12, color: color.muted }}>
                  Verified{claim.purchaseMonth ? ` · owned since ${claim.purchaseMonth}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: space(2), alignItems: "center" }}>
                <Badge tone="verified" icon="✔">
                  Verified owner
                </Badge>
                <Button variant="ghost" onClick={() => app.openProduct(product.id)}>
                  Open Q&A →
                </Button>
              </div>
            </div>
          ))
        )}
        {d.pendingClaims.length > 0 ? (
          <Message tone="warn">
            {d.pendingClaims.length} claim{d.pendingClaims.length === 1 ? "" : "s"} pending admin review.
          </Message>
        ) : null}
      </Card>

      <Card>
        <SectionHeading sub="Open questions on products you own — answer to grow your recognition.">
          Routed questions ({d.routedQuestions.length})
        </SectionHeading>
        {d.routedQuestions.length === 0 ? (
          <Message tone="neutral">No open questions routed to you right now.</Message>
        ) : (
          d.routedQuestions.map(({ question, productTitle }) => (
            <div key={question.id} style={{ padding: `${space(2)}px 0`, borderBottom: `1px solid ${color.line}` }}>
              <div style={{ color: color.ink }}>{question.body}</div>
              <div style={{ fontSize: 12, color: color.muted, marginTop: 4 }}>{productTitle}</div>
              <Button variant="ghost" onClick={() => app.openProduct(question.canonicalProductId, question.id)}>
                Answer this →
              </Button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
