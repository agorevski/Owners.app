/**
 * Home / entry screen (route `/`).
 *
 * Product overview, the email magic-link sign-in stub, and quick links into the core flows.
 * Includes demo accounts so the whole prototype can be walked without a mail round-trip.
 */

import { useState } from "react";
import { useApp } from "../state/AppStore";
import { Button, Card, Field, Message, Note, SectionHeading, TextInput } from "../components/ui";
import { PRIVACY_NOTE, V0_PROVENANCE_NOTE } from "../ui/disclosures";
import { color, space } from "../ui/theme";

export function Home() {
  const app = useApp();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ tone: "verified" | "danger"; text: string } | undefined>();

  async function handleSignIn() {
    try {
      const user = await app.signIn(email);
      setStatus({ tone: "verified", text: `Signed in as @${user.handle}. Magic link auto-followed (v0 stub).` });
    } catch (err) {
      setStatus({ tone: "danger", text: err instanceof Error ? err.message : "Sign-in failed." });
    }
  }

  return (
    <div style={{ display: "grid", gap: space(4) }}>
      <Card>
        <SectionHeading sub="Ask someone who actually owns it. Verified-owner Q&A for Amazon earbuds.">
          Welcome to Owners.app
        </SectionHeading>
        <p style={{ color: color.body, lineHeight: 1.6, margin: 0 }}>
          Shoppers ask real questions on a product page; verified owners answer from lived experience.
          This v0 prototype covers the full ask → verify → answer → helpfulness → handoff flow.
        </p>
        <Note>{V0_PROVENANCE_NOTE}</Note>
      </Card>

      <Card>
        <SectionHeading sub="Same lightweight auth for shoppers and owners.">Sign in</SectionHeading>
        <Field id="email" label="Email" hint="We 'send' a magic link and auto-follow it in this stub — no password.">
          <TextInput id="email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
        </Field>
        <Button onClick={handleSignIn}>Email me a sign-in link</Button>
        {status ? <Message tone={status.tone}>{status.text}</Message> : null}
        <Note>{PRIVACY_NOTE}</Note>

        <div style={{ marginTop: space(4), borderTop: `1px solid ${color.line}`, paddingTop: space(3) }}>
          <p style={{ ...{ fontWeight: 600 }, color: color.body, margin: `0 0 ${space(2)}px` }}>Demo accounts</p>
          <div style={{ display: "flex", gap: space(2), flexWrap: "wrap" }}>
            {app.accounts.map((account) => (
              <Button key={account.id} variant="secondary" onClick={() => setEmail(account.email ?? "")}>
                {account.roles.includes("admin")
                  ? "Admin"
                  : account.id === app.seed?.ownerUser.id
                    ? "Verified owner"
                    : account.roles.includes("owner")
                      ? "Owner (pending)"
                      : "Shopper"}
                {" · @"}
                {account.handle}
              </Button>
            ))}
          </div>
          <Note>Pick an account to prefill its email, then request the link.</Note>
        </div>
      </Card>

      <Card>
        <SectionHeading>Jump into a flow</SectionHeading>
        <div style={{ display: "flex", gap: space(2), flexWrap: "wrap" }}>
          <Button
            variant="secondary"
            onClick={() => app.seed && app.openProduct(app.seed.earbudsProductId)}
            disabled={!app.seed}
          >
            Product Q&A page
          </Button>
          <Button variant="secondary" onClick={() => app.navigate("ownerVerify")}>
            Owner verification
          </Button>
          <Button variant="secondary" onClick={() => app.navigate("ownerDashboard")}>
            Owner dashboard
          </Button>
          <Button variant="secondary" onClick={() => app.navigate("admin")}>
            Admin console
          </Button>
        </div>
        <Note>
          Shoppers can also arrive from the extension via a deep link such as
          {" "}
          <code>?asin=B0EARBUDS1</code> or <code>?productId=…</code>.
        </Note>
      </Card>
    </div>
  );
}
