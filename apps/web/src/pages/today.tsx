import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, when, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";
import { todayActionPath } from "../today-action-path";

const CONF: Record<string, string> = {
  high: "Strong evidence",
  medium: "Some evidence",
  low: "Early signal",
};
const AUTH: Record<string, string> = {
  AUTO_SAFE: "Krevstudio can do this safely on its own.",
  APPROVAL_REQUIRED: "Krevstudio will ask you before anything goes public.",
  DENY: "Krevstudio will not do this for you.",
};

type Rec = {
  start(): void;
  stop(): void;
  onresult:
    | ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  lang: string;
  interimResults: boolean;
};
const speechCtor = (): (new () => Rec) | null => {
  const w = window as unknown as {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Say or type what you need. Krevstudio restates it and only goes there after you agree; it never acts on its own. */
function TellKrevstudio({ id }: { id: string }) {
  const nav = useNavigate();
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<J | null>(null);
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const Speech = speechCtor();
  const ask = async (t: string) => {
    setErr(null);
    try {
      setIntent(await api<J>("POST", `/api/sites/${id}/intent`, { text: t }));
    } catch (e) {
      setErr(errText(e));
    }
  };
  const listen = () => {
    if (!Speech) return;
    const r = new Speech();
    r.lang = "en-NG";
    r.interimResults = false;
    r.onresult = (e) => {
      const t = e.results[0]?.[0]?.transcript ?? "";
      setText(t);
      if (t) void ask(t);
    };
    r.onerror = () =>
      setErr("Krevstudio could not hear that. You can type instead.");
    r.onend = () => setListening(false);
    setListening(true);
    r.start();
  };
  const go = () => {
    if (!intent) return;
    const to =
      intent.route === "today"
        ? `/app/sites/${id}/today`
        : `/app/sites/${id}/${intent.route}`;
    nav(to === `/app/sites/${id}/health` ? "/app/operations" : to);
  };
  return (
    <section className="card stack" aria-labelledby="tell-h">
      <h2 id="tell-h">Tell Krevstudio what you need</h2>
      <form
        className="row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (text.trim()) void ask(text);
        }}
      >
        <label className="grow">
          <span className="sr-only">What do you need?</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder="For example: who is waiting for a reply?"
          />
        </label>
        <button className="btn">Ask</button>
        {Speech && (
          <button
            type="button"
            className="btn ghost"
            onClick={listen}
            aria-pressed={listening}
          >
            {listening ? "Listening…" : "Speak"}
          </button>
        )}
      </form>
      {err && <Notice kind="bad">{err}</Notice>}
      {intent && (
        <div className="stack" role="status">
          <p>{intent.summary}</p>
          {intent.intent !== "unknown" && (
            <div className="row">
              <button className="btn sm" onClick={go}>
                Yes, take me there
              </button>
              <button className="btn sm quiet" onClick={() => setIntent(null)}>
                No
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function TodayPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const recs = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/marketing/recommendations`),
    [id],
  );
  const brief = useLoad(
    () => api<J>("GET", `/api/sites/${id}/marketing/brief`),
    [id],
  );
  const cal = useLoad(() => api<J>("GET", `/api/sites/${id}/calendar`), [id]);
  const actions = useLoad(
    () => api<J>("GET", `/api/sites/${id}/today-actions`),
    [id],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Suggestions are recomputed from current facts whenever the owner opens Today.
  useEffect(() => {
    api("POST", `/api/sites/${id}/marketing/refresh`).then(
      () => recs.reload(),
      () => undefined,
    );
  }, [id]);
  const go = (to: string | null) => {
    const map: Record<string, string> = {
      customers: "customers",
      channels: "channels",
      presence: "presence",
      health: "../operations",
      calendar: "calendar",
    };
    if (to && map[to])
      nav(
        map[to].startsWith("..")
          ? "/app/operations"
          : `/app/sites/${id}/${map[to]}`,
      );
  };
  const act = async (rid: string, what: "accept" | "dismiss") => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<J>(
        "POST",
        `/api/sites/${id}/marketing/recommendations/${rid}/${what}`,
      );
      recs.reload();
      cal.reload();
      if (what === "accept") {
        if (r.result?.calendarItemId)
          setMsg({
            ok: true,
            text: "A draft is ready in your Calendar. Nothing has been posted.",
          });
        else go(r.result?.navigate ?? null);
      }
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  const upcoming = ((cal.data?.items ?? []) as J[])
    .filter(
      (i) =>
        i.scheduledFor &&
        new Date(i.scheduledFor) > new Date() &&
        !["CANCELLED", "PUBLISHED"].includes(i.state),
    )
    .slice(0, 4);
  return (
    <div className="stack">
      <TellKrevstudio id={id!} />
      <Async state={actions}>
        {(a) =>
          a.actions.length === 0 ? null : (
            <section className="card stack" aria-labelledby="do-h">
              <p className="k-overline">Do next</p>
              <h2 id="do-h" style={{ margin: 0 }}>
                What needs you today
              </h2>
              <ul className="k-checks">
                {a.actions.map((x: J) => (
                  <li key={x.id} className="k-check">
                    <Link className="k-lead" to={todayActionPath(id!, x.to)}>
                      <strong>{x.title}</strong>
                      <span className="muted">{x.why}</span>
                      <span className="small muted">{x.expectedOutcome}</span>
                      <span className="small muted">
                        {x.evidence === "OBSERVED"
                          ? "Observed signal"
                          : "Derived recommendation"}
                        {" · "}
                        Action pending your review
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        }
      </Async>
      <Async state={brief}>
        {(b) => (
          <section className="card stack" aria-labelledby="today-h">
            <p className="k-overline">Today</p>
            <h2 id="today-h">{b.brief.headline}</h2>
            {b.brief.sections.map((s: J) => (
              <div key={s.id}>
                <h3>{s.title}</h3>
                <ul className="k-notes">
                  {s.items.map((it: J) => (
                    <li key={it.text}>{it.text}</li>
                  ))}
                </ul>
              </div>
            ))}
            <details>
              <summary>What Krevstudio cannot tell you yet</summary>
              <ul className="k-notes">
                {b.brief.unavailable.map((u: J) => (
                  <li key={u.topic}>
                    <strong>{u.topic}.</strong>{" "}
                    <span className="muted">{u.reason}</span>
                  </li>
                ))}
              </ul>
            </details>
            <div className="row">
              <button
                className="btn sm ghost"
                onClick={async () => {
                  await api("POST", `/api/sites/${id}/marketing/brief`);
                  brief.reload();
                }}
              >
                Save this week's brief
              </button>
            </div>
          </section>
        )}
      </Async>
      {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
      <section aria-labelledby="sugg">
        <h2 id="sugg">What Krevstudio suggests</h2>
        <Async state={recs}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty title="Nothing to suggest right now">
                Krevstudio looks again each time you open this page.
              </Empty>
            ) : (
              <ul className="k-checks">
                {rows.map((r) => (
                  <li key={r.id} className="k-check stack">
                    <div className="row between">
                      <strong>{r.rec.observation}</strong>
                      <Status
                        kind={r.rec.confidence === "high" ? "ok" : "wait"}
                      >
                        {CONF[r.rec.confidence]}
                      </Status>
                    </div>
                    <p className="muted">{r.rec.hypothesis}</p>
                    <details>
                      <summary>What Krevstudio saw</summary>
                      <ul className="k-notes">
                        {r.evidence.map((e: J) => (
                          <li key={e.label}>
                            {e.label}: <strong>{e.value}</strong>{" "}
                            <span className="muted">({e.source})</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                    <p className="muted">
                      {AUTH[r.rec.policy.authority]} {r.rec.policy.reason}
                    </p>
                    <div className="row">
                      <button
                        className="btn sm"
                        disabled={busy}
                        onClick={() => act(r.id, "accept")}
                      >
                        {r.rec.action.type === "create_draft"
                          ? "Write a draft"
                          : r.rec.action.type === "create_brand_kit"
                            ? "Create it"
                            : "Take me there"}
                      </button>
                      <button
                        className="btn sm quiet"
                        disabled={busy}
                        onClick={() => act(r.id, "dismiss")}
                      >
                        Not now
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </section>
      {upcoming.length > 0 && (
        <section aria-labelledby="next">
          <h2 id="next">Coming up</h2>
          <ul className="k-checks">
            {upcoming.map((i) => (
              <li key={i.id} className="k-check row between">
                <span>{i.title}</span>
                <span className="muted">{when(i.scheduledFor)}</span>
              </li>
            ))}
          </ul>
          <p>
            <Link to={`/app/sites/${id}/calendar`}>Open the calendar</Link>
          </p>
        </section>
      )}
    </div>
  );
}

export function CampaignsPage() {
  const { id } = useParams();
  const list = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/campaigns`),
    [id],
    10000,
  );
  const presence = useLoad(
    () => api<J>("GET", `/api/sites/${id}/presence`),
    [id],
  );
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<J | null>(null);
  const offers = (presence.data?.graph?.offer?.activeOffers ?? []) as J[];
  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(null);
    try {
      const r = await api<J>("POST", `/api/sites/${id}/campaigns`, {
        name: String(f.get("name")),
        objective: String(f.get("objective")),
        audience: String(f.get("audience")),
        brief: String(f.get("brief")),
        direction: String(f.get("direction")),
        offerId: String(f.get("offer")),
        startOn: String(f.get("start")),
        endOn: String(f.get("end") || f.get("start")),
        channels: [
          "instagram",
          "facebook",
          "whatsapp",
          "google_business",
        ].filter((c) => f.get(`c-${c}`)),
      });
      setMsg(
        `Built ${r.posts} scheduled posts plus editable campaign graphics and video. Review them before approval.`,
      );
      setOpen(false);
      list.reload();
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Campaigns</p>
        <h2>One offer, every channel</h2>
        <p className="muted">
          Krevstudio builds the images and posts from your offer and Brand Kit.
          Nothing goes out until you approve it.
        </p>
        <div className="row">
          <button className="btn" onClick={() => setOpen(!open)}>
            {open ? "Close" : "New campaign"}
          </button>
        </div>
        {msg && <Notice kind="ok">{msg}</Notice>}
      </section>
      {open && (
        <form
          className="card stack"
          onSubmit={create}
          aria-label="New campaign"
        >
          {offers.length === 0 && (
            <Notice kind="info">
              Add a current offer in your business details before generating
              campaign assets.{" "}
              <Link to={`/app/sites/${id}/presence`}>
                Complete business details
              </Link>
            </Notice>
          )}
          <label>
            Name
            <input name="name" required maxLength={100} />
          </label>
          <label>
            Offer
            <select name="offer" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Objective
            <select name="objective" defaultValue="announce">
              <option value="announce">Announce an offer</option>
              <option value="fill_slots">Fill available slots</option>
              <option value="clear_stock">Clear stock</option>
              <option value="bring_back">Bring customers back</option>
              <option value="build_awareness">Build awareness</option>
            </select>
          </label>
          <label>
            Audience
            <input
              name="audience"
              required
              minLength={3}
              maxLength={200}
              defaultValue="Existing and prospective customers"
            />
          </label>
          <label>
            Campaign brief
            <textarea
              name="brief"
              required
              minLength={8}
              maxLength={500}
              placeholder="State the objective and only confirmed offer details."
            />
          </label>
          <fieldset>
            <legend>Creative direction</legend>
            {[
              ["product", "Product focus"],
              ["moment", "Occasion and timing"],
              ["people", "People-led"],
              ["place", "Place-led"],
            ].map(([value, label]) => (
              <label key={value} className="row">
                <input
                  type="radio"
                  name="direction"
                  value={value}
                  defaultChecked={value === "product"}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            Starts
            <input name="start" type="date" required />
          </label>
          <label>
            Ends (optional)
            <input name="end" type="date" />
          </label>
          <fieldset>
            <legend>Channels</legend>
            {[
              ["instagram", "Instagram"],
              ["facebook", "Facebook Page"],
              ["whatsapp", "WhatsApp (you send it)"],
              ["google_business", "Google Business Profile"],
            ].map(([v, l]) => (
              <label key={v} className="row">
                <input type="checkbox" name={`c-${v}`} />
                {l}
              </label>
            ))}
          </fieldset>
          {err && <Notice kind="bad">{err}</Notice>}
          <div className="row">
            <button className="btn">Build the posts</button>
          </div>
        </form>
      )}
      <Async state={list}>
        {(rows) =>
          rows.length === 0 ? (
            <Empty title="No campaigns yet">
              Pick an offer and Krevstudio will plan the posts.
            </Empty>
          ) : (
            <ul className="k-checks">
              {rows.map((c) => (
                <li key={c.id} className="k-check stack">
                  <div className="row between">
                    <strong>{c.name}</strong>
                    <Status
                      kind={
                        c.status === "ACTIVE"
                          ? "ok"
                          : c.status === "CANCELLED"
                            ? "wait"
                            : "info"
                      }
                    >
                      {c.status.toLowerCase()}
                    </Status>
                  </div>
                  <p className="muted">
                    {c.offerTitle} · {c.startsOn} to {c.endsOn} · {c.published}/
                    {c.items} posted
                    {c.needsApproval
                      ? ` · ${c.needsApproval} need your approval`
                      : ""}
                    {c.problems ? ` · ${c.problems} need attention` : ""}
                  </p>
                  <div className="row">
                    <button
                      className="btn sm ghost"
                      onClick={async () => {
                        try {
                          setDetail(
                            await api<J>(
                              "GET",
                              `/api/sites/${id}/campaigns/${c.id}`,
                            ),
                          );
                        } catch (x) {
                          setErr(errText(x));
                        }
                      }}
                    >
                      Open campaign
                    </button>
                    {c.needsApproval > 0 && (
                      <button
                        className="btn sm"
                        onClick={async () => {
                          try {
                            const r = await api<J>(
                              "POST",
                              `/api/sites/${id}/campaigns/${c.id}/approve-all`,
                            );
                            setMsg(
                              `Approved ${r.approved}. ${r.scheduled} scheduled${r.needsYou.length ? `; ${r.needsYou.length} you post yourself or fix first (see Calendar)` : ""}.`,
                            );
                            list.reload();
                          } catch (x) {
                            setErr(errText(x));
                          }
                        }}
                      >
                        Approve all {c.needsApproval} posts
                      </button>
                    )}
                    <Link
                      className="btn sm ghost"
                      to={`/app/sites/${id}/calendar`}
                    >
                      See in calendar
                    </Link>
                    {c.status !== "CANCELLED" && (
                      <button
                        className="btn sm quiet"
                        onClick={async () => {
                          await api(
                            "POST",
                            `/api/sites/${id}/campaigns/${c.id}/cancel`,
                          );
                          list.reload();
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      {detail && (
        <section className="card stack" aria-label="Campaign workspace">
          <div className="row between">
            <div>
              <p className="k-overline">Campaign workspace</p>
              <h2>{detail.campaign?.name}</h2>
            </div>
            <button className="btn sm quiet" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <p>
            <strong>Objective:</strong> {detail.campaign?.objective} ·{" "}
            <strong>Audience:</strong> {detail.campaign?.audience}
          </p>
          <nav className="chips" aria-label="Campaign views">
            {[
              "Overview",
              "Content library",
              "Calendar",
              "Channels",
              "Approvals",
              "Results",
              "Recommendations",
            ].map((label) => (
              <span className="chip" key={label}>
                {label}
              </span>
            ))}
          </nav>
          <h3>Editable content library</h3>
          <ul className="k-checks">
            {(detail.assets ?? []).map((asset: J) => (
              <li className="k-check row between" key={asset.id}>
                <span>
                  <strong>{String(asset.kind).replace("_", " ")}</strong>
                  <span className="muted"> · {asset.status}</span>
                </span>
                {asset.href ? (
                  <a className="btn sm ghost" href={asset.href} target="_blank">
                    Open landing page
                  </a>
                ) : asset.motionProjectId ? (
                  <Link className="btn sm ghost" to={`/app/sites/${id}/create?tool=video&motion=${encodeURIComponent(asset.motionProjectId)}`}>
                    Edit video
                  </Link>
                ) : (
                  <Link
                    className="btn sm ghost"
                    to={`/app/sites/${id}/creative-studio${asset.creativeDocumentId ? `?document=${encodeURIComponent(asset.creativeDocumentId)}` : ""}`}
                  >
                    Edit design
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="muted">
            Calendar copy and schedules remain approval-bound. Editing public
            content requires a new approval before publishing.
          </p>
          <div className="row">
            <Link className="btn sm" to={`/app/sites/${id}/calendar`}>
              Review calendar
            </Link>
            <Link className="btn sm ghost" to={`/app/sites/${id}/channels`}>
              Channel readiness
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
