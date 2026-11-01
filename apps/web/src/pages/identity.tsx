import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, type J } from "../api";
import { Async, Empty, Notice, errText, useLoad } from "../ui";

const SOURCE: Record<string, string> = {
  OWNER_STATED: "You told Kora",
  OWNER_UPLOADED: "You uploaded",
  VERIFIED: "Confirmed",
  SCRAPED: "Read from the web",
  INFERRED: "Kora's guess",
};

/** Business Identity Snapshot: what Kora knows (with where it came from), and what it still needs to ask. */
export function IdentityPage() {
  const { id } = useParams();
  const truth = useLoad(() => api<J>("GET", `/api/sites/${id}/truth`), [id]);
  const genome = useLoad(() => api<J>("GET", `/api/sites/${id}/genome`), [id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const k of ["positioning", "audience"]) {
      const v = String(f.get(k) ?? "").trim();
      if (v) body[k] = v;
    }
    const d = String(f.get("differentiators") ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 5);
    if (d.length) body.differentiators = d;
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", `/api/sites/${id}/genome`, body);
      setMsg({ ok: true, text: "Saved as a new version of your brand." });
      genome.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <section className="card stack" aria-labelledby="known-h">
        <p className="k-overline">Business identity</p>
        <h2 id="known-h" style={{ margin: 0 }}>
          What Kora knows
        </h2>
        <p className="muted">
          Kora only writes about things on this list. Anything missing, it asks
          you instead of guessing.
        </p>
        <Async state={truth}>
          {(t: J) =>
            t.facts.length === 0 ? (
              <Empty title="Nothing recorded yet">
                Add your business details on the Presence tab first.
              </Empty>
            ) : (
              <ul className="k-checks">
                {t.facts.map((f: J) => (
                  <li key={f.key} className="k-check">
                    <div className="k-lead">
                      <strong>{f.value}</strong>
                      <span className="muted">
                        {f.kind} · {SOURCE[f.source] ?? f.source}
                        {f.expiresAt
                          ? ` · valid to ${String(f.expiresAt).slice(0, 10)}`
                          : ""}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </section>

      <section className="card stack" aria-labelledby="genome-h">
        <h2 id="genome-h" style={{ margin: 0 }}>
          Your brand in your words
        </h2>
        <Async state={genome}>
          {(g: J) => (
            <>
              {g.gaps.length > 0 && (
                <div>
                  <p className="muted">Kora would like to know:</p>
                  <ul>
                    {g.gaps.map((q: string) => (
                      <li key={q}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
              <form className="stack" onSubmit={save}>
                <label>
                  Why choose you?
                  <textarea
                    name="positioning"
                    rows={2}
                    maxLength={240}
                    defaultValue={g.current?.strategic.positioning ?? ""}
                  />
                </label>
                <label>
                  Your best customer
                  <input
                    name="audience"
                    maxLength={240}
                    defaultValue={g.current?.strategic.audience ?? ""}
                  />
                </label>
                <label>
                  What you do that others nearby do not (one per line)
                  <textarea
                    name="differentiators"
                    rows={3}
                    defaultValue={(
                      g.current?.strategic.differentiators ?? []
                    ).join("\n")}
                  />
                </label>
                <div className="row">
                  <button className="btn" disabled={busy}>
                    Save brand
                  </button>
                  {g.current && (
                    <span className="muted small">
                      Version {g.current.version}
                    </span>
                  )}
                </div>
                {msg && (
                  <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>
                )}
              </form>
            </>
          )}
        </Async>
      </section>
    </div>
  );
}
