import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";

const WHAT: Record<string, string> = {
  reply_now: "Reply now",
  nudge: "Gentle follow-up",
  ask_review: "Ask for a review",
};

/** Customers: what to do next with each person. Nothing is sent; every step needs you. */
export function SuggestionsPanel() {
  const { id } = useParams();
  const s = useLoad(
    () => api<J>("GET", `/api/sites/${id}/customers/suggestions`),
    [id],
  );
  return (
    <Async state={s}>
      {(r) =>
        r.data?.length === 0 || (Array.isArray(r) && r.length === 0) ? null : (
          <section className="card stack" aria-labelledby="sug-h">
            <p className="k-overline">Suggested next steps</p>
            <h2 id="sug-h" style={{ margin: 0 }}>
              Who to follow up with
            </h2>
            <ul className="k-checks">
              {(Array.isArray(r) ? r : r.data).map((x: J) => (
                <li key={x.leadId} className="k-check">
                  <div className="k-lead">
                    <strong>
                      {WHAT[x.kind] ?? x.kind}: {x.customer}
                    </strong>
                    <span className="muted">
                      {x.reason}
                      {x.blockedBecause ? ` — ${x.blockedBecause}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="small muted">
              Kora never sends these. You write or approve every message.
            </p>
          </section>
        )
      }
    </Async>
  );
}

const EVIDENCE: Record<string, string> = {
  OBSERVED: "Counted by Kora",
  INFERRED: "Likely",
  ESTIMATED: "Estimate",
};

/** Results: counted, likely or estimated, and never a claimed cause. */
export function PerformancePanel() {
  const { id } = useParams();
  const p = useLoad(() => api<J>("GET", `/api/sites/${id}/performance`), [id]);
  return (
    <Async state={p}>
      {(r) => (
        <section className="card stack" aria-labelledby="perf-h">
          <p className="k-overline">Performance</p>
          <h2 id="perf-h" style={{ margin: 0 }}>
            {r.headline}
          </h2>
          <ul className="k-checks">
            {r.lines.map((l: J) => (
              <li key={l.label} className="k-check">
                <div className="k-lead">
                  <strong>
                    {l.value} {l.label}
                  </strong>
                  <span className="muted">{EVIDENCE[l.evidence]}</span>
                </div>
              </li>
            ))}
          </ul>
          {r.caveats.map((c: string) => (
            <p key={c} className="small muted">
              {c}
            </p>
          ))}
        </section>
      )}
    </Async>
  );
}

/** Studio: pictures made by open-source models. Nothing is used until you approve it. */
export function ImagesPage() {
  const { id } = useParams();
  const status = useLoad(
    () => api<J>("GET", `/api/sites/${id}/media/status`),
    [id],
  );
  const list = useLoad(() => api<J>("GET", `/api/sites/${id}/media`), [id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const make = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const subject = String(
      new FormData(e.currentTarget).get("subject") ?? "",
    ).trim();
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", `/api/sites/${id}/media/generate`, {
        kind: "image",
        subject,
      });
      setMsg({ ok: true, text: "Made. Review it below before you use it." });
      list.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  const review = async (mid: string, decision: "APPROVED" | "REJECTED") => {
    try {
      await api("POST", `/api/sites/${id}/media/${mid}/review`, { decision });
      list.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    }
  };
  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="img-h">
        <p className="k-overline">Studio</p>
        <h2 id="img-h" style={{ margin: 0 }}>
          Pictures made by AI
        </h2>
        <p className="muted">
          Made with open-source models. Kora only pictures things you have told
          it you sell, adds no people or text, and labels every picture as
          AI-made. You approve each one before it is used.
        </p>
        <Async state={status}>
          {(s) =>
            !s.image.configured ? (
              <Empty title="Not set up yet">
                Picture generation needs an image provider to be configured on
                this Kora. Nothing has been made.
              </Empty>
            ) : (
              <form className="row" onSubmit={make}>
                <input
                  name="subject"
                  aria-label="What to picture"
                  placeholder="Birthday cakes"
                  required
                  style={{ flex: 1 }}
                />
                <button className="btn" disabled={busy}>
                  {busy ? "Making…" : "Make a picture"}
                </button>
              </form>
            )
          }
        </Async>
        {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
      </section>
      <Async state={list}>
        {(r) =>
          r.data?.length === 0 ||
          (Array.isArray(r) && r.length === 0) ? null : (
            <ul className="k-checks">
              {(Array.isArray(r) ? r : r.data).map((m: J) => (
                <li key={m.id} className="k-check">
                  {m.mime.startsWith("image/") && (
                    <img
                      src={`/api/sites/${id}/media/${m.id}/file`}
                      alt={`AI-made picture of ${m.subject}`}
                      width="96"
                      height="96"
                      style={{ objectFit: "cover", borderRadius: 8 }}
                    />
                  )}
                  <div className="k-lead">
                    <strong>{m.subject}</strong>
                    <span className="muted">
                      AI-made · {m.provenance.provider} · {m.provenance.license}
                    </span>
                  </div>
                  {m.review === "UNREVIEWED" ? (
                    <span className="row">
                      <button
                        className="btn sm"
                        onClick={() => review(m.id, "APPROVED")}
                      >
                        Approve
                      </button>
                      <button
                        className="btn sm ghost"
                        onClick={() => review(m.id, "REJECTED")}
                      >
                        Reject
                      </button>
                    </span>
                  ) : (
                    <Status kind={m.review === "APPROVED" ? "ok" : "warn"}>
                      {m.review === "APPROVED" ? "Approved" : "Rejected"}
                    </Status>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </div>
  );
}
