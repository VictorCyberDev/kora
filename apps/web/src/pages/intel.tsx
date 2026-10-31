import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, when, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";

const CH: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  google_business: "Google Business",
  tiktok: "TikTok",
  search_console: "Search Console",
};
const METRIC: Record<string, string> = {
  impressions: "Times shown",
  reach: "People reached",
  engagements: "Likes, comments, shares",
  clicks: "Clicks",
  followers: "Followers",
  profile_views: "Profile views",
};

export function ResultsPage() {
  const { id } = useParams();
  const att = useLoad(
    () => api<J>("GET", `/api/sites/${id}/attribution?days=30`),
    [id],
  );
  const an = useLoad(() => api<J>("GET", `/api/sites/${id}/analytics`), [id]);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Results</p>
        <h2>What your posts brought, in the last 30 days</h2>
        <Async state={att}>
          {(a) =>
            a.summary.links === 0 ? (
              <Empty title="No tracked links yet">
                Campaign posts include a link Kora can follow. Add one to any
                post from the Calendar and results appear here.
              </Empty>
            ) : (
              <>
                <dl className="k-caps">
                  {[
                    ["Visits", a.summary.visits],
                    ["WhatsApp taps", a.summary.whatsappTaps],
                    ["Call taps", a.summary.callTaps],
                    ["Enquiries", a.summary.enquiries],
                  ].map(([k, v]) => (
                    <div key={String(k)}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <ul className="k-notes">
                  {Object.entries(a.summary.byChannel as Record<string, J>).map(
                    ([c, v]) => (
                      <li key={c}>
                        {CH[c] ?? c}: {v.visits} visits, {v.whatsappTaps}{" "}
                        WhatsApp taps, {v.callTaps} call taps, {v.enquiries}{" "}
                        enquiries
                      </li>
                    ),
                  )}
                </ul>
              </>
            )
          }
        </Async>
        <Async state={att}>{(a) => <p className="muted">{a.note}</p>}</Async>
      </section>
      <section className="card stack">
        <h2>From your channels</h2>
        <div className="row">
          <button
            className="btn sm"
            onClick={async () => {
              try {
                await api("POST", `/api/sites/${id}/analytics/sync`);
                an.reload();
                setMsg(null);
              } catch (e) {
                setMsg(errText(e));
              }
            }}
          >
            Refresh from channels
          </button>
        </div>
        {msg && <Notice kind="bad">{msg}</Notice>}
        <Async state={an}>
          {(a) =>
            a.providers.length === 0 ? (
              <p className="muted">
                No numbers yet. Connect a channel, then refresh. Some channels
                do not share results with Kora yet; those are simply left blank.
              </p>
            ) : (
              <ul className="k-checks">
                {a.providers.map((p: J) => (
                  <li key={p.provider} className="k-check stack">
                    <div className="row between">
                      <strong>{CH[p.provider] ?? p.provider}</strong>
                      {p.mode === "SANDBOX" && (
                        <Status kind="warn">Test data</Status>
                      )}
                    </div>
                    <ul className="k-notes">
                      {p.totals.map((t: J) => (
                        <li key={t.metric}>
                          {METRIC[t.metric] ?? t.metric}:{" "}
                          <strong>{t.total}</strong>
                        </li>
                      ))}
                    </ul>
                    {p.unmapped.length > 0 && (
                      <p className="muted">
                        Also reported, not yet explained:{" "}
                        {p.unmapped.join(", ")}.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
        <Async state={an}>{(a) => <p className="muted">{a.note}</p>}</Async>
      </section>
    </div>
  );
}

export function ReviewsPage() {
  const { id } = useParams();
  const rv = useLoad(() => api<J>("GET", `/api/sites/${id}/reviews`), [id]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const act = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      rv.reload();
    } catch (e) {
      setErr(errText(e));
    }
  };
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act(async () => {
      await api("POST", `/api/sites/${id}/reviews`, {
        provider: String(f.get("provider")),
        rating: Number(f.get("rating")),
        author: String(f.get("author")),
        body: String(f.get("body")),
      });
      setAdding(false);
    });
  };
  return (
    <div className="stack">
      <Async state={rv}>
        {(v) => (
          <section className="card stack">
            <p className="k-overline">Reviews</p>
            <h2>
              {v.summary.count === 0
                ? "No reviews recorded yet"
                : `${v.summary.average} average from ${v.summary.count} review${v.summary.count === 1 ? "" : "s"}`}
            </h2>
            {v.summary.needsYou > 0 && (
              <Notice kind="warn">
                {v.summary.needsYou} review
                {v.summary.needsYou === 1 ? " needs" : "s need"} you personally.
                Kora does not write replies to negative or sensitive reviews.
              </Notice>
            )}
            {v.summary.themes.length > 0 && (
              <p>
                Customers keep mentioning:{" "}
                {v.summary.themes
                  .map((t: J) => `${t.word} (${t.reviews})`)
                  .join(", ")}
                .
              </p>
            )}
            <div className="row">
              <button className="btn sm" onClick={() => setAdding(!adding)}>
                Add a review you received
              </button>
              <button
                className="btn sm ghost"
                onClick={() =>
                  act(() => api("POST", `/api/sites/${id}/reviews/sync`))
                }
              >
                Check connected channels
              </button>
            </div>
          </section>
        )}
      </Async>
      {err && <Notice kind="bad">{err}</Notice>}
      {adding && (
        <form className="card stack" onSubmit={add} aria-label="Add a review">
          <label>
            Where
            <select name="provider">
              {[
                "google_business",
                "facebook",
                "instagram",
                "tiktok",
                "whatsapp",
              ].map((p) => (
                <option key={p} value={p}>
                  {CH[p]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stars
            <input
              name="rating"
              type="number"
              min={1}
              max={5}
              defaultValue={5}
              required
            />
          </label>
          <label>
            Name
            <input name="author" maxLength={120} />
          </label>
          <label>
            What they wrote
            <textarea name="body" rows={3} maxLength={4000} />
          </label>
          <div className="row">
            <button className="btn">Save</button>
          </div>
        </form>
      )}
      <Async state={rv}>
        {(v) =>
          v.reviews.length === 0 ? null : (
            <ul className="k-checks">
              {v.reviews.map((r: J) => (
                <li key={r.id} className="k-check stack">
                  <div className="row between">
                    <strong>
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)} {r.author}
                    </strong>
                    <span className="muted">
                      {CH[r.provider] ?? r.provider}
                      {r.mode === "SANDBOX" ? " · test" : ""} ·{" "}
                      {when(r.reviewedAt)}
                    </span>
                  </div>
                  <p>{r.body}</p>
                  {r.sensitive && <Status kind="bad">Needs you</Status>}
                  {r.replies.map((p: J) => (
                    <p key={p.id} className="muted">
                      Draft reply: {p.body}
                    </p>
                  ))}
                  <div className="row">
                    {!r.sensitive && r.status !== "REPLIED" && (
                      <button
                        className="btn sm ghost"
                        onClick={() =>
                          act(() =>
                            api(
                              "POST",
                              `/api/sites/${id}/reviews/${r.id}/suggest-reply`,
                            ),
                          )
                        }
                      >
                        Suggest a thank-you
                      </button>
                    )}
                    {r.status !== "REPLIED" && (
                      <button
                        className="btn sm"
                        onClick={() =>
                          act(() =>
                            api(
                              "POST",
                              `/api/sites/${id}/reviews/${r.id}/replied`,
                            ),
                          )
                        }
                      >
                        I replied on the platform
                      </button>
                    )}
                    {r.status !== "DISMISSED" && (
                      <button
                        className="btn sm quiet"
                        onClick={() =>
                          act(() =>
                            api(
                              "POST",
                              `/api/sites/${id}/reviews/${r.id}/dismiss`,
                            ),
                          )
                        }
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </div>
  );
}

const KIND: Record<string, string> = {
  PREFERENCE: "Preference",
  FACT: "Fact",
  DECISION: "Decision",
  OUTCOME: "What happened",
};
export function MemoryPage() {
  const { id } = useParams();
  const mem = useLoad(() => api<J[]>("GET", `/api/sites/${id}/memory`), [id]);
  const [err, setErr] = useState<string | null>(null);
  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    setErr(null);
    try {
      const kind = String(f.get("kind"));
      await api("POST", `/api/sites/${id}/memory`, {
        kind: kind === "AVOID" || kind === "USE" ? "PREFERENCE" : kind,
        key:
          kind === "AVOID"
            ? "avoid_word"
            : kind === "USE"
              ? "use_word"
              : String(f.get("key")),
        value: String(f.get("value")),
      });
      form.reset();
      mem.reload();
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Memory</p>
        <h2>What Kora remembers about your business</h2>
        <p className="muted">
          Only you and Kora's own records of finished campaigns. Words you ask
          Kora to avoid are applied to every post it writes or checks.
        </p>
      </section>
      <form
        className="card stack"
        onSubmit={add}
        aria-label="Teach Kora something"
      >
        <label>
          Type
          <select name="kind" defaultValue="AVOID">
            <option value="AVOID">A word never to use</option>
            <option value="USE">A word to use</option>
            <option value="FACT">A fact about us</option>
            <option value="DECISION">A decision we made</option>
          </select>
        </label>
        <label>
          Label (for facts and decisions)
          <input name="key" maxLength={80} defaultValue="note" />
        </label>
        <label>
          What to remember
          <input name="value" required maxLength={500} />
        </label>
        {err && <Notice kind="bad">{err}</Notice>}
        <div className="row">
          <button className="btn">Remember this</button>
        </div>
      </form>
      <Async state={mem}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title="Nothing remembered yet">
              When a campaign finishes, Kora records what its links brought
              here.
            </Empty>
          ) : (
            <ul className="k-checks">
              {rows.map((m) => (
                <li key={m.id} className="k-check stack">
                  <div className="row between">
                    <strong>
                      {KIND[m.kind] ?? m.kind}: {m.key}
                    </strong>
                    <span className="muted">
                      {m.source === "SYSTEM" ? "Recorded by Kora" : "You"} ·{" "}
                      {when(m.createdAt)}
                    </span>
                  </div>
                  <p>{m.value}</p>
                  <div className="row">
                    <button
                      className="btn sm quiet"
                      onClick={async () => {
                        await api("DELETE", `/api/sites/${id}/memory/${m.id}`);
                        mem.reload();
                      }}
                    >
                      Forget
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </div>
  );
}
