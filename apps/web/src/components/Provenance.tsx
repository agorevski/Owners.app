/**
 * Provenance label — a first-class UI element, never a footnote (docs/01, docs/03).
 *
 * Every owner answer renders a provenance label + timestamp identifying it as a verified
 * owner's answer (color is paired with an icon + text so color is not the only signal). The
 * v0 guardrail: no UI implies an answer is owner-written unless it is (docs/09 section 9).
 */

import { color } from "../ui/theme";
import { Badge } from "./ui";
import type { AnswerView } from "../client/localClient";

/** Coarse relative time; avoids exposing precise timestamps in the public UI. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return `${months}mo ago`;
}

export function ProvenanceLabel({ answer }: { answer: AnswerView }) {
  const revoked = answer.claimStatus === "revoked" || answer.claimStatus === "rejected";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Badge tone="verified" icon="✔">
        Verified owner
      </Badge>
      <span style={{ color: color.muted, fontSize: 12 }}>@{answer.authorHandle}</span>
      <span style={{ color: color.muted, fontSize: 12 }} aria-hidden="true">
        ·
      </span>
      <span style={{ color: color.muted, fontSize: 12 }}>{relativeTime(answer.createdAt)}</span>
      {revoked ? (
        <Badge tone="warn" icon="ⓘ">
          Ownership {answer.claimStatus} since posting
        </Badge>
      ) : null}
    </span>
  );
}
