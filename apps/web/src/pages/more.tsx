import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Outlet,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ago, money, when, type J } from "../api";
import { useAuth } from "../auth";
import { Async, Empty, Notice, Status, Tabs, errText, useLoad } from "../ui";
import { PlanCard } from "./public";
import { SiteStatusCard } from "./sites";

export function SiteShell() {
  const { id } = useParams();
  const ctx = useOutletContext<{ proof: boolean }>();
  const site = useLoad(() => api("GET", `/api/sites/${id}`), [id]);
  const base = `/app/sites/${id}`;
  return (
    <div>
      <Async state={site}>
        {(s: J) => (
          <div className="row between">
            <h1 style={{ fontSize: "2rem", margin: 0 }}>{s.name}</h1>
            {s.publicUrl && (
              <a
                className="btn sm ghost"
                href={s.publicUrl}
                target="_blank"
                rel="noreferrer"
              >
                Visit website
              </a>
            )}
          </div>
        )}
      </Async>
      <Tabs
        items={[
          [base, "Overview"],
          [`${base}/build`, "Build"],
          [`${base}/deployments`, "Deployments"],
          [`${base}/incidents`, "Incidents"],
          [`${base}/domains`, "Domain"],
          [`${base}/forms`, "Messages"],
          [`${base}/settings`, "Settings"],
        ]}
      />
      <Outlet context={ctx} />
    </div>
  );
}

export function SiteOverview() {
  const { id } = useParams();
  const st = useLoad(() => api("GET", `/api/sites/${id}/status`), [id], 4000);
  const inc = useLoad(
    () => api("GET", `/api/sites/${id}/incidents`),
    [id],
    5000,
  );
  const [err, setErr] = useState<string | null>(null);
  const chaos = async (mode: string | null) => {
    setErr(null);
    try {
      await (mode
        ? api("POST", `/api/sites/${id}/chaos`, { mode })
        : api("DELETE", `/api/sites/${id}/chaos`));
      st.reload();
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <div className="stack">
      <SiteStatusCard siteId={id!} />
      <div className="card">
        <h3>Recent incidents</h3>
        <Async state={inc}>
          {(r: J[]) =>
            r.length === 0 ? (
              <p className="muted">
                None. Kora opens an incident only after repeated failed checks.
              </p>
            ) : (
              <ul>
                {r.slice(0, 5).map((i) => (
                  <li key={i.id}>
                    <Link to={`/app/sites/${id}/incidents/${i.id}`}>
                      {when(i.startedAt)}
                    </Link>{" "}
                    — {i.resolvedAt ? "resolved" : "open"}
                  </li>
                ))}
              </ul>
            )
          }
        </Async>
      </div>
      {st.data?.chaosAvailable && (
        <div className="card stack">
          <div className="row">
            <h3 style={{ margin: 0 }}>Chaos Lab</h3>
            <span className="badge-test">Controlled test</span>
          </div>
          <p className="muted">
            Makes the <em>live version</em> of this website fail on purpose, for
            real, so you can watch Kora detect it, explain it, propose a fix and
            verify recovery. Use it only on a test website.
          </p>
          {err && <Notice kind="bad">{err}</Notice>}
          {st.data.controlledTest ? (
            <div className="row">
              <Status kind="warn">
                Test running: {st.data.controlledTest.mode}
              </Status>
              <button className="btn quiet sm" onClick={() => chaos(null)}>
                End test
              </button>
            </div>
          ) : (
            <div className="row">
              <button
                className="btn quiet sm"
                disabled={!st.data.publicUrl}
                onClick={() => chaos("http_500")}
              >
                Start HTTP 500 test
              </button>
              <button
                className="btn quiet sm"
                disabled={!st.data.publicUrl}
                onClick={() => chaos("timeout")}
              >
                Start timeout test
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DeploymentsPage() {
  const { id } = useParams();
  const d = useLoad(
    () => api("GET", `/api/sites/${id}/deployments`),
    [id],
    6000,
  );
  return (
    <Async state={d}>
      {(x: J) => (
        <div className="stack">
          <div className="card">
            <h3>Publishing history</h3>
            {x.jobs.length === 0 ? (
              <p className="muted">Nothing published yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>What</th>
                    <th>Result</th>
                    <th>Live copy check</th>
                  </tr>
                </thead>
                <tbody>
                  {x.jobs.map((j: J) => (
                    <tr key={j.id}>
                      <td>{when(j.startedAt)}</td>
                      <td>
                        {j.kind.toLowerCase()} via {j.publisher}
                      </td>
                      <td>
                        {j.status === "SUCCEEDED" ? (
                          <Status kind="ok">Succeeded</Status>
                        ) : j.status === "FAILED" ? (
                          <Status kind="bad">Failed</Status>
                        ) : (
                          <Status kind="info">Running</Status>
                        )}
                      </td>
                      <td className="small">
                        {j.detail?.verification?.status ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h3>What changed</h3>
            <p className="small muted">
              Kora records changes so it can tell you what happened around the
              time of a problem. Timing is not proof of cause.
            </p>
            <ul className="timeline">
              {x.changes.map((c: J) => (
                <li key={c.id}>
                  <strong>{c.kind.replaceAll("_", " ").toLowerCase()}</strong>{" "}
                  <span className="small muted">
                    {when(c.occurredAt)}
                    {c.revision ? ` · ${c.revision}` : ""} · {c.provenance}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Async>
  );
}

export function DomainsPage() {
  const { id } = useParams();
  const d = useLoad(() => api("GET", `/api/sites/${id}/domains`), [id]);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<J | null>(null);
  const connect = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);
    try {
      setRes(
        await api("POST", `/api/sites/${id}/domains/connect`, {
          hostname: new FormData(e.currentTarget).get("hostname"),
        }),
      );
      d.reload();
    } catch (x) {
      setErr(errText(x));
    }
  };
  const check = async (domainId: string) => {
    setErr(null);
    try {
      setRes(await api("GET", `/api/domains/${domainId}/status`));
      d.reload();
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <Async state={d}>
      {(x: J) => (
        <div className="stack">
          <div className="card stack">
            <h3>Use your own domain</h3>
            <form className="row" onSubmit={connect}>
              <label className="grow">
                Domain you own
                <input name="hostname" placeholder="www.example.com" required />
              </label>
              <button className="btn">Connect</button>
            </form>
            {err && <Notice kind="bad">{err}</Notice>}
            <div className="row">
              <button className="btn quiet" disabled aria-disabled="true">
                Buy a domain
              </button>
              <span className="small muted">{x.purchase.reason}</span>
            </div>
          </div>
          {x.domains.map((dm: J) => (
            <div className="card stack" key={dm.id}>
              <div className="row between">
                <h3 style={{ margin: 0 }}>{dm.hostname}</h3>
                {dm.state === "ACTIVE" ? (
                  <Status kind="ok">Connected · SSL active</Status>
                ) : dm.state === "VERIFYING" ? (
                  <Status kind="info">Checking…</Status>
                ) : (
                  <Status kind="warn">Action required</Status>
                )}
              </div>
              {dm.state !== "ACTIVE" && (
                <>
                  <p>
                    {dm.dnsState === "POINTING_ELSEWHERE"
                      ? "Your domain still points somewhere else."
                      : dm.dnsState === "CORRECT"
                        ? "DNS is right; waiting for the secure connection."
                        : "Create this record at your DNS provider:"}
                  </p>
                  <table>
                    <tbody>
                      <tr>
                        <th>Type</th>
                        <td className="mono">{dm.record.type}</td>
                      </tr>
                      <tr>
                        <th>Name</th>
                        <td className="mono">{dm.record.name}</td>
                      </tr>
                      <tr>
                        <th>Value</th>
                        <td className="mono">{dm.record.value}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="small muted">{dm.record.note}</p>
                </>
              )}
              <div className="row">
                <button className="btn sm" onClick={() => check(dm.id)}>
                  Check now
                </button>
                <span className="small muted">
                  Last checked{" "}
                  {dm.lastVerifiedAt ? ago(dm.lastVerifiedAt) : "never"}
                </span>
              </div>
            </div>
          ))}
          {res?.detail && <Notice>{res.detail}</Notice>}
          <p className="small muted">
            Registrars configured:{" "}
            {x.providers
              .map(
                (p: J) =>
                  `${p.name} (${p.configured ? "ready" : "not configured"})`,
              )
              .join(", ")}
            .
          </p>
        </div>
      )}
    </Async>
  );
}

export function FormsPage() {
  const { id } = useParams();
  const f = useLoad(() => api("GET", `/api/sites/${id}/forms`), [id], 8000);
  const set = async (sid: string, status: string) => {
    await api("PATCH", `/api/sites/${id}/forms/${sid}`, { status });
    f.reload();
  };
  return (
    <div className="stack">
      <h2>Messages from your website</h2>
      <Notice>
        Messages are stored here. Email forwarding is not set up, so check this
        page.
      </Notice>
      <Async state={f}>
        {(rows: J[]) =>
          rows.length === 0 ? (
            <Empty title="No messages yet" />
          ) : (
            <div className="stack">
              {rows.map((r) => (
                <div
                  className="card"
                  key={r.id}
                  style={{ opacity: r.status === "ARCHIVED" ? 0.6 : 1 }}
                >
                  <div className="row between">
                    <strong>{r.fields.name ?? "Someone"}</strong>
                    <span className="small muted">
                      {when(r.submittedAt)} · {r.status.toLowerCase()}
                    </span>
                  </div>
                  <p>{r.fields.message}</p>
                  <p className="small muted">
                    {[r.fields.email, r.fields.phone, r.fields.service]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="row">
                    <button
                      className="btn sm quiet"
                      onClick={() => set(r.id, "READ")}
                    >
                      Mark read
                    </button>
                    <button
                      className="btn sm quiet"
                      onClick={() => set(r.id, "ARCHIVED")}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}

export function SiteSettings() {
  const { id } = useParams();
  const site = useLoad(() => api("GET", `/api/sites/${id}`), [id]);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("PATCH", `/api/sites/${id}`, {
        name: f.get("name"),
        description: f.get("description"),
      });
      setMsg("Saved.");
    } catch (x) {
      setMsg(errText(x));
    }
  };
  return (
    <Async state={site}>
      {(s: J) => (
        <form className="card stack" style={{ maxWidth: 560 }} onSubmit={save}>
          <h3>Website settings</h3>
          <label>
            Name
            <input name="name" defaultValue={s.name} required />
          </label>
          <label>
            Description
            <textarea name="description" defaultValue={s.description} />
          </label>
          <button className="btn">Save</button>
          {msg && <Notice>{msg}</Notice>}
          <p className="small muted">
            Your website address:{" "}
            <span className="mono">{s.publicUrl ?? "not published yet"}</span>
          </p>
        </form>
      )}
    </Async>
  );
}

export function OperationsPage() {
  const sites = useLoad(() => api("GET", "/api/sites"), [], 8000);
  const ch = useLoad(() => api("GET", "/api/notifications/channels"));
  const { proof } = useOutletContext<{ proof: boolean }>();
  return (
    <div className="stack">
      <h1 style={{ fontSize: "2rem" }}>Operations</h1>
      <div className="card">
        <h3>How Kora operates</h3>
        <p>
          Observe → detect → explain → propose → <strong>policy decides</strong>{" "}
          → you approve if needed → act →{" "}
          <strong>verify with new checks</strong> → record.
        </p>
        <p className="small muted">
          The AI can explain and suggest. It cannot run commands, and it cannot
          declare success: only new health checks can.
        </p>
        <Async state={ch}>
          {(c: J) => (
            <p className="small">
              In-app alerts: on. Email alerts:{" "}
              {c.email.available ? "on" : "off"}
              {c.email.available ? "" : ` — ${c.email.reason}`}
            </p>
          )}
        </Async>
      </div>
      <Async state={sites}>
        {(rows: J[]) =>
          rows.length === 0 ? (
            <Empty title="Nothing to operate yet" />
          ) : (
            <div className="stack">
              {rows.map((s) => (
                <SiteStatusCard key={s.id} siteId={s.id} compact={!proof} />
              ))}
            </div>
          )
        }
      </Async>
    </div>
  );
}

export function BillingPage() {
  const { orgs } = useAuth();
  const orgId = orgs[0]?.id as string | undefined;
  const [params] = useSearchParams();
  const sub = useLoad(
    () => api("GET", `/api/orgs/${orgId}/subscription`),
    [orgId],
  );
  const plans = useLoad(() => api("GET", "/api/billing/plans"));
  const tx = useLoad(() => api("GET", `/api/orgs/${orgId}/billing`), [orgId]);
  const [msg, setMsg] = useState<string | null>(null);
  const reference = params.get("reference");
  useEffect(() => {
    if (!reference) return;
    api("POST", "/api/billing/verify", { reference }).then(
      (r: J) => {
        setMsg(
          r.activated
            ? "Payment confirmed. Your plan is active."
            : `Payment status: ${String(r.status).toLowerCase()}.`,
        );
        sub.reload();
        tx.reload();
      },
      (e: unknown) => setMsg(errText(e)),
    );
  }, [reference]);
  const buy = async (planCode: string) => {
    try {
      const r = await api("POST", "/api/billing/checkout", { orgId, planCode });
      window.location.assign(r.authorizationUrl);
    } catch (x) {
      setMsg(errText(x));
    }
  };
  return (
    <div className="stack">
      <h1 style={{ fontSize: "2rem" }}>Billing</h1>
      {msg && <Notice>{msg}</Notice>}
      <Async state={sub}>
        {(s: J) => (
          <div className="card">
            <h3>Current plan</h3>
            <p>
              <strong>{s.subscription?.planCode ?? "none"}</strong> ·{" "}
              {s.subscription?.state?.toLowerCase()}
              {s.subscription?.periodEnd
                ? ` · until ${when(s.subscription.periodEnd)}`
                : ""}
            </p>
            {s.entitlements.restrictedReason && (
              <Notice kind="warn">{s.entitlements.restrictedReason}</Notice>
            )}
            {!s.paymentsConfigured && (
              <Notice>
                Online payments are not configured on this Kora, so plans can't
                be bought here yet.
              </Notice>
            )}
            <h4>Usage this month</h4>
            {s.usage.length === 0 ? (
              <p className="muted small">No usage recorded yet.</p>
            ) : (
              <ul>
                {s.usage.map((u: J) => (
                  <li key={u.dimension}>
                    {u.dimension.replaceAll("_", " ").toLowerCase()}: {u.total}
                  </li>
                ))}
              </ul>
            )}
            <p className="small muted">
              Server CPU and bandwidth: not available from provider.
            </p>
          </div>
        )}
      </Async>
      <Async state={plans}>
        {(rows: J[]) => (
          <div className="grid">
            {rows.map((p) => (
              <PlanCard
                key={p.code}
                p={p}
                action={
                  p.amountMinor > 0 ? (
                    <button
                      className="btn sm"
                      disabled={!p.checkoutAvailable}
                      onClick={() => buy(p.code)}
                    >
                      {p.checkoutAvailable
                        ? "Choose plan"
                        : "Payments not configured"}
                    </button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </Async>
      <div className="card">
        <h3>Payments</h3>
        <Async state={tx}>
          {(rows: J[]) =>
            rows.length === 0 ? (
              <p className="muted">No payments yet.</p>
            ) : (
              <table>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.reference}>
                      <td>{when(t.createdAt)}</td>
                      <td>{t.planCode}</td>
                      <td>{money(t.amountMinor, t.currency)}</td>
                      <td>{t.status.toLowerCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Async>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user, orgs, refresh } = useAuth();
  const org = orgs[0];
  const o = useLoad(() => api("GET", `/api/orgs/${org?.id}`), [org?.id]);
  const [msg, setMsg] = useState<string | null>(null);
  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api("POST", `/api/orgs/${org.id}/members`, {
        email: f.get("email"),
        role: f.get("role"),
      });
      setMsg("Added.");
      o.reload();
      await refresh();
    } catch (x) {
      setMsg(errText(x));
    }
  };
  return (
    <div className="stack">
      <h1 style={{ fontSize: "2rem" }}>Settings</h1>
      <div className="card">
        <h3>Account</h3>
        <p>
          {user?.displayName} · {user?.email}
        </p>
        <p className="small muted">
          Organization: {org?.name} ({org?.role?.toLowerCase()})
        </p>
      </div>
      <div className="card stack">
        <h3>Team</h3>
        <Async state={o}>
          {(x: J) => (
            <table>
              <tbody>
                {x.members.map((m: J) => (
                  <tr key={m.userId}>
                    <td>{m.displayName}</td>
                    <td>{m.email}</td>
                    <td>{m.role.toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Async>
        {["OWNER", "ADMIN"].includes(org?.role) && (
          <form className="row" onSubmit={add}>
            <label className="grow">
              Email of an existing Kora user
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role">
                <option value="MEMBER">Member</option>
                <option value="VIEWER">Viewer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <button className="btn">Add</button>
          </form>
        )}
        {msg && <Notice>{msg}</Notice>}
      </div>
    </div>
  );
}

export function AuditPage() {
  const { orgs } = useAuth();
  const org = orgs[0];
  const a = useLoad(() => api("GET", `/api/orgs/${org?.id}/audit`), [org?.id]);
  if (org && !["OWNER", "ADMIN"].includes(org.role))
    return <Notice>Only owners and admins can see the activity log.</Notice>;
  return (
    <div className="stack">
      <h1 style={{ fontSize: "2rem" }}>Activity</h1>
      <p className="muted">
        Every consequential action is recorded here and cannot be edited.
      </p>
      <Async state={a}>
        {(rows: J[]) => (
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Object</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="small">{when(r.occurredAt)}</td>
                  <td>{r.action}</td>
                  <td className="small mono">{r.objectType}</td>
                  <td className="small">{r.actorKind.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Async>
    </div>
  );
}
