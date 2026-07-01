/**
 * Product Q&A page (route `/products/[canonicalProductId]`).
 *
 * Identity strip with provenance summary, prior verified-owner Q&A (each answer carries a
 * provenance label + timestamp and helpful/report actions), the shopper ask flow, the owner
 * answer flow (with clear pending / wrong-product errors), and the disclosed no-affiliate
 * Amazon handoff.
 */

import { useState } from "react";
import { useApp } from "../state/AppStore";
import { useAsync } from "../state/useAsync";
import { ApiClientError, type AnswerView, type ProductView, type QuestionView } from "../client/localClient";
import { Badge, Button, Card, Field, Message, Note, SectionHeading, TextArea } from "../components/ui";
import { ProvenanceLabel, relativeTime } from "../components/Provenance";
import { ReportControl } from "../components/ReportControl";
import { HandoffButton } from "../components/HandoffButton";
import { V0_PROVENANCE_NOTE } from "../ui/disclosures";
import { color, space } from "../ui/theme";

function AnswerBlock({ answer, onChanged }: { answer: AnswerView; onChanged: () => void }) {
  const app = useApp();
  const [msg, setMsg] = useState<string | undefined>();

  async function markHelpful() {
    try {
      const res = await app.client.markHelpful(answer.id, true);
      await app.client.recordEvent("answer_marked_helpful", { answerId: answer.id });
      setMsg(`Marked helpful (${res.helpfulCount}).`);
      onChanged();
    } catch (err) {
      setMsg(err instanceof ApiClientError ? err.message : "Could not record vote.");
    }
  }

  return (
    <div style={{ borderLeft: `3px solid ${color.verified}`, paddingLeft: space(3), marginTop: space(3) }}>
      <ProvenanceLabel answer={answer} />
      <p style={{ color: color.body, lineHeight: 1.6, margin: `${space(2)}px 0` }}>{answer.body}</p>
      <div style={{ display: "flex", gap: space(2), alignItems: "center", flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={markHelpful} aria-label="Mark answer helpful">
          👍 Helpful ({answer.helpfulCount})
        </Button>
        <ReportControl targetType="answer" targetId={answer.id} />
      </div>
      {msg ? <Message tone="verified">{msg}</Message> : null}
    </div>
  );
}

function AnswerComposer({ question, product, onChanged }: { question: QuestionView; product: ProductView["product"]; onChanged: () => void }) {
  const app = useApp();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<{ tone: "verified" | "danger" | "warn"; text: string } | undefined>();

  const canAnswerState = useAsync(
    () => (app.currentUser ? app.client.hasVerifiedOwnership(app.currentUser.id, product.id) : Promise.resolve(false)),
    [app.currentUser?.id, product.id, app.refreshKey],
  );

  if (!app.currentUser) {
    return <Note>Sign in as a verified owner to answer this question.</Note>;
  }

  async function submit() {
    if (!body.trim()) {
      setStatus({ tone: "danger", text: "Write an answer first." });
      return;
    }
    try {
      await app.client.createAnswer({ questionId: question.id, body: body.trim() });
      await app.client.recordEvent("answer_submitted", { questionId: question.id });
      setStatus({ tone: "verified", text: "Answer posted. Thanks for helping a shopper." });
      setBody("");
      onChanged();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "OWNERSHIP_REQUIRED") {
        setStatus({
          tone: "danger",
          text: "Verified ownership of THIS product is required to answer. A pending or wrong-product claim doesn't qualify — verify on your Owner page.",
        });
      } else {
        setStatus({ tone: "danger", text: err instanceof ApiClientError ? err.message : "Could not post answer." });
      }
    }
  }

  return (
    <div id={`composer-${question.id}`} style={{ marginTop: space(3), background: color.subtle, padding: space(3), borderRadius: 8 }}>
      {canAnswerState.data ? (
        <Badge tone="verified" icon="✔">
          You're a verified owner — your answer will show the verified badge
        </Badge>
      ) : (
        <Message tone="warn">
          You don't have verified ownership of this product yet. You can try, but the server will require it.
        </Message>
      )}
      <div style={{ marginTop: space(2) }}>
        <Field id={`answer-${question.id}`} label="Your answer">
          <TextArea
            id={`answer-${question.id}`}
            value={body}
            onChange={setBody}
            placeholder="Answer from your real experience owning this product…"
          />
        </Field>
        <Button onClick={submit}>Post verified answer</Button>
        {status ? <Message tone={status.tone}>{status.text}</Message> : null}
      </div>
    </div>
  );
}

function QuestionBlock({ question, product, onChanged }: { question: QuestionView; product: ProductView["product"]; onChanged: () => void }) {
  return (
    <Card style={{ marginBottom: space(3) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: space(2), flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 16, color: color.ink }}>{question.body}</h3>
        <Badge tone={question.answers.length ? "verified" : "neutral"} icon={question.answers.length ? "✔" : "…"}>
          {question.answers.length ? "Answered" : "Awaiting owner"}
        </Badge>
      </div>
      <p style={{ color: color.muted, fontSize: 12, margin: `${space(1)}px 0 0` }}>
        Asked by @{question.authorHandle} · {relativeTime(question.createdAt)}
      </p>

      {question.answers.map((a) => (
        <AnswerBlock key={a.id} answer={a} onChanged={onChanged} />
      ))}

      <div style={{ marginTop: space(2) }}>
        <ReportControl targetType="question" targetId={question.id} />
      </div>

      <AnswerComposer question={question} product={product} onChanged={onChanged} />
    </Card>
  );
}

function AskBox({ product, onChanged }: { product: ProductView["product"]; onChanged: () => void }) {
  const app = useApp();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<{ tone: "verified" | "danger"; text: string } | undefined>();

  async function ask() {
    if (!body.trim()) {
      setStatus({ tone: "danger", text: "Type your question first." });
      return;
    }
    try {
      await app.client.recordEvent("question_started");
      await app.client.createQuestion({ canonicalProductId: product.id, body: body.trim() });
      await app.client.recordEvent("question_submitted");
      setStatus({ tone: "verified", text: "Question posted to verified owners. You'll be notified of answers." });
      setBody("");
      onChanged();
    } catch (err) {
      setStatus({ tone: "danger", text: err instanceof ApiClientError ? err.message : "Could not post question." });
    }
  }

  return (
    <Card>
      <SectionHeading sub="Answered by people who actually own it — not the brand, not AI.">
        Ask the owners
      </SectionHeading>
      <Field id="ask-body" label="Your question">
        <TextArea id="ask-body" value={body} onChange={setBody} placeholder="e.g. How do they hold up for phone calls in wind?" />
      </Field>
      <Button onClick={ask}>Ask a verified owner</Button>
      {status ? <Message tone={status.tone}>{status.text}</Message> : null}
      {!app.currentUser ? <Note>Posting as a guest. Sign in to track answers to your questions.</Note> : null}
    </Card>
  );
}

export function ProductPage() {
  const app = useApp();
  const productId = app.nav.params.productId;

  const state = useAsync<ProductView | null>(
    () => (productId ? app.client.getProductView(productId) : Promise.resolve(null)),
    [productId, app.refreshKey],
  );

  if (!productId) {
    return (
      <Card>
        <SectionHeading>Product Q&A</SectionHeading>
        <Message tone="warn">No product selected. Open one from Home or via an extension deep link.</Message>
      </Card>
    );
  }
  if (state.loading) return <Card>Loading product…</Card>;
  if (!state.data) {
    return (
      <Card>
        <SectionHeading>Product Q&A</SectionHeading>
        <Message tone="danger">We couldn't find that product{app.nav.params.asin ? ` (ASIN ${app.nav.params.asin})` : ""}.</Message>
      </Card>
    );
  }

  const view = state.data;

  return (
    <div style={{ display: "grid", gap: space(4) }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: space(2), flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 22, color: color.ink }}>{view.product.title}</h2>
          {view.product.provisional ? (
            <Badge tone="warn" icon="ⓘ">
              Provisional listing
            </Badge>
          ) : (
            <Badge tone="verified" icon="✔">
              Canonical product
            </Badge>
          )}
        </div>
        <p style={{ color: color.muted, margin: `${space(2)}px 0 0`, fontSize: 14 }}>
          {view.verifiedOwnerCount} verified {view.verifiedOwnerCount === 1 ? "owner" : "owners"}
          {view.lastUpdate ? ` · last update ${relativeTime(view.lastUpdate)}` : " · no activity yet"}
        </p>
        <HandoffButton asin={view.primaryAsin} />
        <Note>{V0_PROVENANCE_NOTE}</Note>
      </Card>

      <AskBox product={view.product} onChanged={app.refresh} />

      <div>
        <SectionHeading sub="Ranked by verified owners. Every answer shows who it came from and when.">
          Owner answers ({view.questions.length})
        </SectionHeading>
        {view.questions.length === 0 ? (
          <Card>
            <Message tone="neutral">No questions yet — be the first to ask above.</Message>
          </Card>
        ) : (
          view.questions.map((q) => (
            <QuestionBlock key={q.id} question={q} product={view.product} onChanged={app.refresh} />
          ))
        )}
      </div>
    </div>
  );
}
