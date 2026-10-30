import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ago, ApiError, when, type J } from "../api";
import { useAuth } from "../auth";
import { FEELS, GOALS } from "../design-labels";
import { localAiState, runLocalDesign, type LocalAiState } from "../local-ai";
import { Async, Empty, Notice, Status, errText, kindFor, useLoad } from "../ui";

export function SiteStatusCard({
  siteId,
  compact,
}: {
  siteId: string;
  compact?: boolean;
}) {
  const st = useLoad(
    () => api("GET", `/api/sites/${siteId}/status`),
    [siteId],
    4000,
  );
  return (
    <Async state={st}>
      {(s: J) => {
        const kind = kindFor(s.headline.status);
        const settled = s.headline.status === "RECOVERED";
        return (
          <div
            className={`hero-status ${kind === "wait" ? "" : kind} ${settled ? "recovered" : ""}`}
            aria-live="polite"
          >
            <div className="row between">
              <Status kind={kind}>{s.headline.title}</Status>
              {s.controlledTest && (
                <span className="badge-test">Controlled test</span>
              )}
            </div>
            <div className="big">{s.site.name}</div>
            <div>{s.headline.detail}</div>
            {!compact && (
              <>
                <div className="row small muted">
                  {s.publicUrl && (
                    <a href={s.publicUrl} target="_blank" rel="noreferrer">
                      {s.publicUrl}
                    </a>
                  )}
                  {s.latestCheck && (
                    <span>Last check {ago(s.latestCheck.observedAt)}</span>
                  )}
                  {s.uptime24h?.percent != null && (
                    <span>
                      {s.uptime24h.percent}% of checks passed in the last 24
                      hours ({s.uptime24h.checks} checks)
                    </span>
                  )}
                </div>
                <div className="row small muted">
                  {s.version && <span>Version {s.version.number}</span>}
                  {s.deployment && (
                    <span>
                      Last deployment {when(s.deployment.occurredAt)} (
                      {s.deployment.status.toLowerCase()})
                    </span>
                  )}
                  {s.domains?.length > 0 && (
                    <span>
                      Domain {s.domains[0].hostname}:{" "}
                      {s.domains[0].state.replaceAll("_", " ").toLowerCase()}
                    </span>
                  )}
                </div>
                {s.openIncidentId && (
                  <p style={{ margin: 0 }}>
                    <Link
                      className="btn sm"
                      to={`/app/sites/${siteId}/incidents/${s.openIncidentId}`}
                    >
                      See what happened
                    </Link>
                  </p>
                )}
              </>
            )}
          </div>
        );
      }}
    </Async>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const sites = useLoad(() => api("GET", "/api/sites"));
  return (
    <div className="stack">
      <h1 style={{ fontSize: "2rem" }}>Hello, {user?.displayName}</h1>
      <Async state={sites}>
        {(rows: J[]) =>
          rows.length === 0 ? (
            <Empty title="You have no website yet">
              Describe your business and Kora builds the first version in
              seconds.
              <p>
                <Link className="btn" to="/app/sites/new">
                  Build my website
                </Link>
              </p>
            </Empty>
          ) : (
            <>
              {rows.slice(0, 3).map((s) => (
                <div key={s.id} className="stack">
                  <SiteStatusCard siteId={s.id} />
                  <div className="row">
                    <Link to={`/app/sites/${s.id}`}>Open {s.name}</Link>
                    <Link to={`/app/sites/${s.id}/build`}>Edit</Link>
                  </div>
                </div>
              ))}
              <div className="grid">
                <Plan />
                <Operator />
              </div>
            </>
          )
        }
      </Async>
    </div>
  );
}
function Plan() {
  const { orgs } = useAuth();
  const sub = useLoad(
    () => api("GET", `/api/orgs/${orgs[0]?.id}/subscription`),
    [orgs[0]?.id],
  );
  return (
    <div className="card">
      <h3>Your plan</h3>
      <Async state={sub}>
        {(s: J) => (
          <>
            <p>
              <strong>{s.subscription?.planCode ?? "No plan"}</strong> —{" "}
              {s.subscription?.state?.toLowerCase() ?? "inactive"}
            </p>
            {s.entitlements.restrictedReason && (
              <Notice kind="warn">{s.entitlements.restrictedReason}</Notice>
            )}
            <Link to="/app/billing">Manage plan and billing</Link>
          </>
        )}
      </Async>
    </div>
  );
}
function Operator() {
  const ch = useLoad(() => api("GET", "/api/notifications/channels"));
  return (
    <div className="card">
      <h3>Kora operator</h3>
      <p className="muted">
        Watches your websites, explains problems from evidence, and proposes
        typed fixes. Anything that changes what customers see needs your
        approval.
      </p>
      <Async state={ch}>
        {(c: J) => (
          <p className="small muted">
            {c.ai?.available
              ? `AI explanations: ${c.ai.model}. `
              : "AI explanations: off (rule-based). "}
            {c.email.available ? "Email alerts are on." : c.email.reason}
          </p>
        )}
      </Async>
      <Link to="/app/operations">Operations</Link>
    </div>
  );
}

export function SitesList() {
  const sites = useLoad(() => api("GET", "/api/sites"));
  return (
    <div className="stack">
      <div className="row between">
        <h1 style={{ fontSize: "2rem" }}>Websites</h1>
        <Link className="btn" to="/app/sites/new">
          New website
        </Link>
      </div>
      <Async state={sites}>
        {(rows: J[]) =>
          rows.length === 0 ? (
            <Empty title="No websites yet" />
          ) : (
            <div className="grid">
              {rows.map((s) => (
                <Link
                  key={s.id}
                  to={`/app/sites/${s.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div className="card">
                    <h3>{s.name}</h3>
                    <p className="muted small">
                      {s.status.toLowerCase()} ·{" "}
                      {s.publicUrl ?? "not published"}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}

function ScaledFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="shot" ref={box}>
      <iframe
        title={title}
        src={src}
        sandbox="allow-same-origin"
        loading="lazy"
        tabIndex={-1}
        style={{ ["--s" as string]: scale }}
      />
    </div>
  );
}

type Direction = {
  index: number;
  name: string;
  summary: string;
  swatches: string[];
  previewUrl: string;
};
const STAGES = [
  "Reading what you wrote",
  "Designing three directions",
  "Building your site",
  "Checking quality and accessibility",
] as const;

export function NewSite() {
  const { orgs } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
  const [dirs, setDirs] = useState<Direction[] | null>(null);
  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ai, setAi] = useState<LocalAiState>("unsupported");
  const [useAi, setUseAi] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  useEffect(() => {
    void localAiState().then((st) => {
      setAi(st);
      setUseAi(st === "available");
    });
  }, []);

  const describe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    const b = {
      name: text("name"),
      description: text("description") ?? "",
      goal: text("goal"),
      feel: text("feel"),
      location: text("location"),
      whatsapp: text("whatsapp")?.replace(/\s/g, ""),
      email: text("email"),
      phone: text("phone"),
    };
    setBusy(true);
    setErr(null);
    setQuestions([]);
    setStage(1);
    try {
      const site =
        siteId !== null
          ? { id: siteId }
          : await api("POST", "/api/sites", {
              orgId: orgs[0]?.id,
              name: b.name,
              description: b.description,
            });
      setSiteId(site.id);
      setBrief(b);
      const d = await api("POST", `/api/sites/${site.id}/design/directions`, b);
      setDirs(d);
      setStage(2);
    } catch (x) {
      if (x instanceof ApiError && x.status === 400) {
        setQuestions([
          "Please give the business a name and one or two sentences about what it does.",
        ]);
      } else setErr(errText(x));
      setStage(0);
    } finally {
      setBusy(false);
    }
  };
  const build = async (direction: 0 | 1 | 2) => {
    if (!siteId || !brief) return;
    setPicked(direction);
    setBusy(true);
    setErr(null);
    setStage(3);
    try {
      // Optional: ask the on-device model first. Kora validates whatever it says; failure is silent.
      let local: { text: string; provider: string } | null = null;
      if (useAi && (ai === "available" || ai === "downloadable")) {
        setAiNote(
          ai === "downloadable"
            ? "Preparing AI on this device…"
            : "Using on-device AI…",
        );
        try {
          const spec = await api("GET", "/api/design/intelligence");
          local = await runLocalDesign(brief, spec);
        } catch {
          local = null;
        }
        setAiNote(null);
      }
      await api("POST", `/api/sites/${siteId}/generate`, {
        ...brief,
        direction,
        ...(local
          ? { intelligence: local.text, intelligenceProvider: local.provider }
          : {}),
      });
      setStage(4);
      nav(`/app/sites/${siteId}/build`);
    } catch (x) {
      if (x instanceof ApiError && x.code === "more_details_needed") {
        setQuestions(x.body.questions);
        setDirs(null);
        setStage(0);
      } else setErr(errText(x));
      setBusy(false);
    }
  };

  if (dirs)
    return (
      <div className="stack">
        <div>
          <h1 style={{ fontSize: "2rem" }}>Pick a direction</h1>
          <p className="muted">
            Three different looks for the same business. You can change colours,
            type and layout afterwards.
          </p>
        </div>
        {busy && stage >= 3 ? (
          <div
            className="card stack narrow"
            style={{ maxWidth: 520 }}
            aria-live="polite"
          >
            <h2 style={{ fontSize: "1.4rem" }}>Building your website</h2>
            {aiNote && <p className="small muted">{aiNote}</p>}
            <ol className="stages">
              {STAGES.map((l, i) => (
                <li
                  key={l}
                  data-s={
                    i < stage - 1 ? "done" : i === stage - 1 ? "doing" : "todo"
                  }
                >
                  <span className="dot" aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            <div className="dirs">
              {dirs.map((d) => (
                <div
                  key={d.index}
                  className="dir"
                  aria-current={picked === d.index}
                >
                  <ScaledFrame
                    src={d.previewUrl}
                    title={`Direction ${d.index + 1}: ${d.name}`}
                  />
                  <div>
                    <strong>{d.name}</strong>
                    <div className="small muted">{d.summary}</div>
                  </div>
                  <span className="chips" aria-hidden="true">
                    <span className="chip sw">
                      {d.swatches.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </span>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void build(d.index as 0 | 1 | 2)}
                  >
                    Use this direction
                  </button>
                </div>
              ))}
            </div>
            {err && <Notice kind="bad">{err}</Notice>}
            {(ai === "available" || ai === "downloadable") && (
              <label className="row" style={{ gap: 8 }}>
                <input
                  style={{ width: 20, minHeight: 20 }}
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                />
                <span>
                  Use AI on this device
                  <span className="small muted">
                    {ai === "downloadable"
                      ? " (one-time download; nothing is sent to a server for this step)"
                      : " (private; nothing is sent to a server for this step)"}
                  </span>
                </span>
              </label>
            )}
            <div className="row">
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => void build(0)}
              >
                Choose for me
              </button>
              <button
                className="btn quiet"
                disabled={busy}
                onClick={() => setDirs(null)}
              >
                Change what I wrote
              </button>
            </div>
          </>
        )}
      </div>
    );

  return (
    <form
      className="card stack narrow"
      style={{ maxWidth: 640 }}
      onSubmit={describe}
    >
      <h1 style={{ fontSize: "2rem" }}>Tell Kora about your business</h1>
      <label>
        Business name
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={String(brief?.name ?? "")}
        />
      </label>
      <label>
        What do you do?
        <textarea
          name="description"
          required
          minLength={12}
          defaultValue={String(brief?.description ?? "")}
          placeholder="We repair fridges, washing machines and cookers in Ikeja."
        />
        <span className="field-hint">
          Two lines is enough. Kora only uses what you write here. It will not
          invent services, prices or reviews.
        </span>
      </label>
      <div className="grid">
        <label>
          What matters most?
          <select name="goal" defaultValue="">
            {GOALS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          How should it feel?
          <select name="feel" defaultValue="">
            {FEELS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Add contact details (optional)</summary>
        <div className="grid" style={{ marginTop: 12 }}>
          <label>
            Phone
            <input name="phone" type="tel" />
          </label>
          <label>
            WhatsApp number
            <input name="whatsapp" type="tel" placeholder="+234…" />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Location
            <input name="location" />
          </label>
        </div>
      </details>
      {questions.length > 0 && (
        <Notice kind="warn">
          <strong>Kora needs a little more:</strong>
          <ul>
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </Notice>
      )}
      {err && <Notice kind="bad">{err}</Notice>}
      <button className="btn" disabled={busy}>
        {busy ? "Designing…" : "Show me three designs"}
      </button>
    </form>
  );
}
