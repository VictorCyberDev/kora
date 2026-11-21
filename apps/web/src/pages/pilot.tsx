import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Async, Notice, errText, useLoad } from "../ui";

type PilotStatus = {
  enrolled: boolean;
  participant?: {
    id: string;
    segment: string;
    industry: string;
    enrolled_at: string;
    revoked_at: string | null;
  };
  observedMilestones?: {
    firstProjectAt: string | null;
    firstExportAt: string | null;
    firstPublicationAt: string | null;
  };
  observations?: { kind: string; observed_at: string }[];
  paymentsVerified?: boolean;
  note?: string;
};

function PilotWorkspace({ orgId }: { orgId: string }) {
  const status = useLoad(
    () => api<PilotStatus>("GET", `/api/pilot/status?orgId=${orgId}`),
    [orgId],
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const submit = async (path: string, data: unknown) => {
    setBusy(true);
    setMessage(null);
    try {
      await api("POST", path, data);
      setMessage({
        ok: true,
        text: path.endsWith("enroll")
          ? "Participation consent recorded. No commercial result has been assumed."
          : path.endsWith("withdraw")
            ? "Participation withdrawn. No further pilot feedback will be collected."
            : "Feedback recorded as owner-reported, not as verified revenue.",
      });
      status.reload();
    } catch (error) {
      setMessage({ ok: false, text: errText(error) });
    } finally {
      setBusy(false);
    }
  };
  const enroll = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get("consent") !== "yes") return;
    void submit("/api/pilot/enroll", {
      orgId,
      segment: form.get("segment"),
      industry: form.get("industry"),
      consent: true,
    });
  };
  const feedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("monthlyAmount") ?? "").trim();
    void submit("/api/pilot/feedback", {
      orgId,
      rating: Number(form.get("rating")),
      comments: String(form.get("comments") ?? ""),
      ...(raw
        ? {
            pricing: {
              statedMonthlyAmount: Number(raw),
              currency: "NGN",
            },
          }
        : {}),
    });
  };
  return (
    <Async state={status}>
      {(p) => (
        <div className="stack">
          {message && (
            <Notice kind={message.ok ? "ok" : "bad"}>{message.text}</Notice>
          )}
          {!p.enrolled ? (
            <section className="card stack">
              <h2>Join the optional product pilot</h2>
              <p className="muted">
                The pilot measures how real businesses create, publish and
                improve. Participation does not authorize posts, payments or
                marketing messages. You can withdraw later.
              </p>
              <form className="stack" onSubmit={enroll}>
                <label>
                  Business segment
                  <select name="segment" required defaultValue="small_business">
                    <option value="small_business">Small business</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="creative_professional">
                      Creative professional
                    </option>
                    <option value="agency">Small agency</option>
                  </select>
                </label>
                <label>
                  Industry
                  <input
                    name="industry"
                    minLength={2}
                    maxLength={120}
                    required
                  />
                </label>
                <label className="row">
                  <input
                    type="checkbox"
                    name="consent"
                    value="yes"
                    required
                    style={{ width: 20, minHeight: 20 }}
                  />
                  I consent to taking part in the Krevstudio product pilot and
                  having my pilot activity and feedback recorded.
                </label>
                <button className="btn" disabled={busy}>
                  Enroll this business
                </button>
              </form>
            </section>
          ) : (
            <>
              <section className="card stack">
                <h2>Pilot participation</h2>
                <p>
                  Consenting business:{" "}
                  <strong>{p.participant?.industry}</strong>
                </p>
                <p className="small muted">
                  Milestones come from actual system records after enrollment.
                  Missing values are not success claims.
                </p>
                <dl>
                  <dt>First creative project</dt>
                  <dd>
                    {p.observedMilestones?.firstProjectAt ?? "Not observed"}
                  </dd>
                  <dt>First export</dt>
                  <dd>
                    {p.observedMilestones?.firstExportAt ?? "Not observed"}
                  </dd>
                  <dt>First website publication</dt>
                  <dd>
                    {p.observedMilestones?.firstPublicationAt ?? "Not observed"}
                  </dd>
                  <dt>Verified paid conversion</dt>
                  <dd>
                    {p.paymentsVerified
                      ? "Verified in billing"
                      : "Not verified by this pilot"}
                  </dd>
                </dl>
                <p className="muted">{p.note}</p>
              </section>
              <section className="card stack">
                <h2>Share product feedback</h2>
                <p className="small muted">
                  Your quality rating and optional price estimate are
                  self-reported feedback, not proof of a purchase.
                </p>
                <form className="stack" onSubmit={feedback}>
                  <label>
                    Product quality
                    <select name="rating" defaultValue="4" required>
                      <option value="1">1 — Poor</option>
                      <option value="2">2 — Needs work</option>
                      <option value="3">3 — Acceptable</option>
                      <option value="4">4 — Good</option>
                      <option value="5">5 — Excellent</option>
                    </select>
                  </label>
                  <label>
                    What worked? What should improve?
                    <textarea name="comments" maxLength={1000} rows={4} />
                  </label>
                  <label>
                    Optional monthly price you might pay (NGN)
                    <input
                      name="monthlyAmount"
                      inputMode="decimal"
                      type="number"
                      min="0"
                      max="1000000"
                      step="1"
                    />
                  </label>
                  <button className="btn" disabled={busy}>
                    Submit feedback
                  </button>
                </form>
              </section>
              <section className="card stack">
                <h2>Participation controls</h2>
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void submit("/api/pilot/withdraw", { orgId })}
                >
                  Withdraw pilot consent
                </button>
              </section>
            </>
          )}
        </div>
      )}
    </Async>
  );
}

export function PilotPage() {
  const { id } = useParams();
  const site = useLoad(
    () => api<{ orgId: string }>("GET", `/api/sites/${id}`),
    [id],
  );
  return (
    <div className="stack">
      <h1>Commercial pilot</h1>
      <Async state={site}>{(s) => <PilotWorkspace orgId={s.orgId} />}</Async>
    </div>
  );
}
