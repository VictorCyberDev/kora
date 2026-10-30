import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ago, ApiError, when, type J } from "../api";
import { useAuth } from "../auth";
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

export function NewSite() {
  const { orgs } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    setBusy(true);
    setErr(null);
    setQuestions([]);
    try {
      const site = await api("POST", "/api/sites", {
        orgId: orgs[0]?.id,
        name: text("name"),
        description: text("description") ?? "",
      });
      try {
        await api("POST", `/api/sites/${site.id}/generate`, {
          name: text("name"),
          description: text("description") ?? "",
          location: text("location"),
          whatsapp: text("whatsapp")?.replace(/\s/g, ""),
          email: text("email"),
          phone: text("phone"),
          wantsQuoteForm: f.get("quote") === "on",
        });
      } catch (x) {
        if (x instanceof ApiError && x.code === "more_details_needed") {
          setQuestions(x.body.questions);
          setBusy(false);
          return;
        }
        throw x;
      }
      nav(`/app/sites/${site.id}/build`);
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  };
  return (
    <form
      className="card stack narrow"
      style={{ maxWidth: 640 }}
      onSubmit={submit}
    >
      <h1 style={{ fontSize: "2rem" }}>Tell Kora about your business</h1>
      <label>
        Business name
        <input name="name" required maxLength={100} />
      </label>
      <label>
        What do you do?
        <textarea
          name="description"
          required
          minLength={12}
          placeholder="We provide pickup and delivery, dry cleaning and ironing in Lagos."
        />
        <span className="field-hint">
          Kora only uses what you write here. It will not invent services,
          prices or reviews.
        </span>
      </label>
      <div className="grid">
        <label>
          Phone (optional)
          <input name="phone" type="tel" />
        </label>
        <label>
          WhatsApp number (optional)
          <input name="whatsapp" type="tel" placeholder="+234…" />
        </label>
        <label>
          Email (optional)
          <input name="email" type="email" />
        </label>
        <label>
          Location (optional)
          <input name="location" />
        </label>
      </div>
      <label className="row">
        <input
          style={{ width: 22, minHeight: 22 }}
          type="checkbox"
          name="quote"
          defaultChecked
        />{" "}
        Add a contact / quote form
      </label>
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
        {busy ? "Building your website…" : "Create my website"}
      </button>
    </form>
  );
}
