/**
 * Inline report control for a question or answer (docs/03 moderation; no dark patterns).
 *
 * Expands to a short reason field and submits into the moderation queue via POST /api/reports.
 * Reporting is available to any signed-in user; anonymous users are prompted to sign in.
 */

import { useState } from "react";
import type { ReportTargetType } from "@owners/shared";
import { useApp } from "../state/AppStore";
import { Button, Message, TextArea } from "./ui";
import { space } from "../ui/theme";

export function ReportControl({
  targetType,
  targetId,
}: {
  targetType: ReportTargetType;
  targetId: string;
}) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<{ tone: "verified" | "danger"; text: string } | undefined>();

  async function submit() {
    if (!app.currentUser) {
      setStatus({ tone: "danger", text: "Sign in to report content." });
      return;
    }
    if (!reason.trim()) {
      setStatus({ tone: "danger", text: "Add a short reason." });
      return;
    }
    try {
      await app.client.createReport({ targetType, targetId, reason: reason.trim() });
      await app.client.recordEvent("content_reported", { targetType });
      setStatus({ tone: "verified", text: "Reported. Our moderators will review it." });
      setReason("");
      setOpen(false);
      app.refresh();
    } catch (err) {
      setStatus({ tone: "danger", text: err instanceof Error ? err.message : "Report failed." });
    }
  }

  if (!open) {
    return (
      <>
        <Button variant="ghost" onClick={() => setOpen(true)} aria-label={`Report this ${targetType}`}>
          ⚑ Report
        </Button>
        {status ? <Message tone={status.tone}>{status.text}</Message> : null}
      </>
    );
  }

  return (
    <div style={{ marginTop: space(2) }}>
      <TextArea
        id={`report-${targetId}`}
        value={reason}
        onChange={setReason}
        placeholder="Why are you reporting this? (e.g. spam, harassment, undisclosed promotion)"
        rows={2}
      />
      <div style={{ display: "flex", gap: space(2), marginTop: space(2) }}>
        <Button onClick={submit}>Submit report</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {status ? <Message tone={status.tone}>{status.text}</Message> : null}
    </div>
  );
}
