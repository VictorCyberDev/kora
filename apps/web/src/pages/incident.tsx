import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { api, ago, when, type J } from "../api";
import { Async, Empty, Notice, Spinner, Status, errText, useLoad } from "../ui";

export function IncidentsList() {
  const { id } = useParams();
  const rows = useLoad(
    () => api("GET", `/api/sites/${id}/incidents`),
    [id],
    5000,
  );
  return (
    <div className="stack">
      <h2>Incidents</h2>
      <Async state={rows}>
        {(r: J[]) =>
          r.length === 0 ? (
            <Empty title="No incidents">
              Kora will open one only after repeated failed checks.
            </Empty>
          ) : (
            <table tabIndex={0}>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {r.map((i) => (
                  <tr key={i.id}>
                    <td>{when(i.startedAt)}</td>
                    <td>
                      {i.resolvedAt ? (
                        <Status kind="ok">Resolved {ago(i.resolvedAt)}</Status>
                      ) : (
                        <Status kind="bad">Needs attention</Status>
                      )}
                    </td>
                    <td>
                      <Link to={i.id}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }
      </Async>
    </div>
  );
}

const STAGES = [
  "Detected",
  "Fix recommended",
  "Approved",
  "Fixing",
  "Checking recovery",
  "Recovered",
] as const;
/** Where the incident is on the one path every incident takes, from durable state only. */
function stageOf(v: J, a: J | null | undefined): number {
  if (v.verification.state === "RECOVERY_VERIFIED") return 5;
  if (v.verification.state === "VERIFYING") return 4;
  if (!a) return 0;
  if (a.state === "EXECUTING" || a.state === "READY") return 3;
  if (a.state === "AWAITING_APPROVAL") return 1;
  if (a.state === "EXECUTED") return 4;
  return 2;
}

export function IncidentPage() {
  const { id: siteId, incidentId } = useParams();
  const { proof } = useOutletContext<{ proof: boolean }>();
  const view = useLoad(
    () => api("GET", `/api/incidents/${incidentId}`),
    [incidentId],
    3000,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      view.reload();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <p className="small">
        <Link to={`/app/sites/${siteId}/incidents`}>← All incidents</Link>
      </p>
      <Async state={view}>
        {(v: J) => {
          const a = v.recommendedAction;
          const resolved = Boolean(v.incident.resolvedAt);
          const stage = stageOf(v, a);
          return (
            <>
              <div
                className={`hero-status ${v.verification.state === "RECOVERY_VERIFIED" ? "ok recovered" : v.verification.state === "VERIFYING" ? "info" : a?.state === "AWAITING_APPROVAL" ? "warn" : resolved ? "ok" : "bad"}`}
                aria-live="polite"
              >
                <Status
                  kind={
                    v.verification.state === "RECOVERY_VERIFIED"
                      ? "ok"
                      : v.verification.state === "VERIFYING"
                        ? "info"
                        : a?.state === "AWAITING_APPROVAL"
                          ? "warn"
                          : resolved
                            ? "ok"
                            : "bad"
                  }
                >
                  {v.verification.state === "RECOVERY_VERIFIED"
                    ? "Recovered"
                    : v.verification.state === "VERIFYING"
                      ? "Checking recovery"
                      : a?.state === "AWAITING_APPROVAL"
                        ? "Waiting for approval"
                        : a?.state === "EXECUTING" || a?.state === "READY"
                          ? "Fixing"
                          : resolved
                            ? "Resolved"
                            : "Needs attention"}
                </Status>
                <div className="big">{v.whatHappened}</div>
              </div>

              <ol className="track" aria-label="Where this incident is">
                {STAGES.map((label, i) => (
                  <li
                    key={label}
                    data-s={i < stage ? "done" : i === stage ? "now" : "next"}
                    aria-current={i === stage ? "step" : undefined}
                  >
                    <span className="pip" aria-hidden="true" />
                    {label}
                  </li>
                ))}
              </ol>

              <div className="inc-grid">
                <div className="stack">
                  <section className="card stack" aria-labelledby="q-story">
                    <h2 id="q-story" style={{ fontSize: "1.5rem", margin: 0 }}>
                      What happened
                    </h2>
                    <p>{v.whatHappened}</p>
                    {v.explanation.text !== v.whatHappened && (
                      <p className="small muted">
                        {v.explanation.text}{" "}
                        <em>
                          (
                          {v.explanation.source === "MODEL"
                            ? "AI explanation"
                            : "Generated from the evidence by rules"}
                          )
                        </em>
                      </p>
                    )}
                    <dl className="facts">
                      <div>
                        <dt>Impact</dt>
                        <dd>
                          {v.affected.websiteAffectedNow ? (
                            <Status kind="bad">Customers are affected</Status>
                          ) : (
                            <Status kind="ok">Checks are passing</Status>
                          )}
                          {v.affected.websiteAffectedNow && (
                            <ul>
                              {v.affected.notes.map((n: string) => (
                                <li key={n}>{n}</li>
                              ))}
                            </ul>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>When</dt>
                        <dd>
                          {when(v.began)}
                          <div className="small muted">{ago(v.began)}</div>
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="card stack" aria-labelledby="q-changed">
                    <h2
                      id="q-changed"
                      style={{ fontSize: "1.25rem", margin: 0 }}
                    >
                      What Kora observed and what changed
                    </h2>
                    {v.whatChanged.length === 0 ? (
                      <p className="muted">
                        Kora recorded no change in the minutes before the first
                        failure.
                      </p>
                    ) : (
                      <ol className="timeline">
                        {v.whatChanged.map((c: J) => (
                          <li key={c.at + c.kind}>{c.text}</li>
                        ))}
                      </ol>
                    )}
                  </section>

                  <div className="know">
                    <section className="card" aria-labelledby="q-know">
                      <h2
                        id="q-know"
                        style={{ fontSize: "1.15rem", margin: "0 0 8px" }}
                      >
                        What Kora knows
                      </h2>
                      <ul>
                        {v.whatWeKnow.length ? (
                          v.whatWeKnow.map((k: string) => <li key={k}>{k}</li>)
                        ) : (
                          <li className="muted">Not enough evidence yet.</li>
                        )}
                      </ul>
                    </section>
                    <section className="card" aria-labelledby="q-unknown">
                      <h2
                        id="q-unknown"
                        style={{ fontSize: "1.15rem", margin: "0 0 8px" }}
                      >
                        What Kora does not know
                      </h2>
                      <ul>
                        {v.whatWeDoNotKnow.map((k: string) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <section className="card" aria-labelledby="q-evidence">
                    <h2
                      id="q-evidence"
                      style={{ fontSize: "1.15rem", margin: "0 0 8px" }}
                    >
                      Technical evidence
                    </h2>
                    <Proof incidentId={incidentId!} open={proof} />
                  </section>
                </div>

                <aside
                  className="card stack side-action"
                  aria-labelledby="q-action"
                >
                  <h2 id="q-action" style={{ fontSize: "1.25rem", margin: 0 }}>
                    Recommended action
                  </h2>
                  {!a ? (
                    <p className="muted">
                      {resolved
                        ? "No action is needed."
                        : "Kora has no safe action to recommend yet."}
                    </p>
                  ) : (
                    <>
                      <p style={{ margin: 0 }}>
                        <strong>{a.text}</strong>
                      </p>
                      <p className="muted" style={{ margin: 0 }}>
                        {a.reason}
                      </p>
                      {a.policy && (
                        <p className="small" style={{ margin: 0 }}>
                          Policy:{" "}
                          <strong>
                            {a.policy.decision === "ALLOW"
                              ? "allowed automatically"
                              : a.policy.decision === "DENY"
                                ? "not allowed"
                                : "needs your approval"}
                          </strong>{" "}
                          — {a.policy.reason}
                        </p>
                      )}
                      {a.state === "DENIED" && (
                        <Notice kind="warn">
                          Kora cannot do this itself. It may need a manual step
                          with your hosting provider.
                        </Notice>
                      )}
                    </>
                  )}
                  {a?.state === "AWAITING_APPROVAL" ? (
                    <div className="stack">
                      <Notice kind="warn">
                        This changes what your customers see. Kora will not do
                        it without your approval
                        {a.approvalExpiresAt
                          ? ` (request expires ${when(a.approvalExpiresAt)})`
                          : ""}
                        .
                      </Notice>
                      {err && <Notice kind="bad">{err}</Notice>}
                      <div className="row">
                        <button
                          className="btn"
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await api(
                                "POST",
                                `/api/actions/${a.actionId}/approve`,
                                {},
                              );
                              await api(
                                "POST",
                                `/api/actions/${a.actionId}/execute`,
                              );
                            })
                          }
                        >
                          {busy ? "Working…" : "Approve and apply"}
                        </button>
                        <button
                          className="btn quiet"
                          disabled={busy}
                          onClick={() =>
                            act(() =>
                              api(
                                "POST",
                                `/api/actions/${a.actionId}/reject`,
                                {},
                              ),
                            )
                          }
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="muted small" style={{ margin: 0 }}>
                      {a
                        ? `Status: ${a.state.toLowerCase().replaceAll("_", " ")}.`
                        : "No approval is needed."}
                    </p>
                  )}
                  {!a && !resolved && (
                    <button
                      className="btn quiet"
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          api("POST", `/api/incidents/${incidentId}/reason`),
                        )
                      }
                    >
                      Ask Kora to re-check the evidence
                    </button>
                  )}
                  <hr />
                  <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
                    Recovery check
                  </h3>
                  {v.verification.state === "VERIFYING" && (
                    <Spinner label="Watching for your website to work again" />
                  )}
                  <p style={{ margin: 0 }}>{v.verification.text}</p>
                  {v.verification.recoverySeconds != null && (
                    <p className="small muted" style={{ margin: 0 }}>
                      Down for about{" "}
                      {Math.round(v.verification.recoverySeconds)} seconds in
                      total.
                    </p>
                  )}
                </aside>
              </div>
            </>
          );
        }}
      </Async>
    </div>
  );
}

function Proof({ incidentId, open }: { incidentId: string; open: boolean }) {
  const diag = useLoad(
    () => api("GET", `/incidents/${incidentId}/diagnosis`),
    [incidentId],
  );
  const timeline = useLoad(
    () => api("GET", `/incidents/${incidentId}/timeline`),
    [incidentId],
  );
  const reasoning = useLoad(
    () => api("GET", `/api/incidents/${incidentId}/reasoning`),
    [incidentId],
  );
  const actions = useLoad(
    () => api("GET", `/api/incidents/${incidentId}/actions`),
    [incidentId],
    5000,
  );
  const [passport, setPassport] = useState<string | null>(null);
  return (
    <details open={open}>
      <summary>Evidence, decisions and Passport</summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <h4>Diagnosis (deterministic)</h4>
        <Async state={diag}>
          {(d: J) => (
            <>
              <p className="small muted">
                Root cause: {d.rootCause.state} — {d.rootCause.statement}
              </p>
              <pre>
                {JSON.stringify(
                  {
                    findings: d.findings,
                    contradictions: d.contradictions,
                    evidenceGaps: d.evidenceGaps,
                    contentHash: d.contentHash,
                  },
                  null,
                  2,
                )}
              </pre>
            </>
          )}
        </Async>
        <h4>Timeline</h4>
        <Async state={timeline}>
          {(t: J[]) => (
            <ol className="timeline">
              {t.map((e, i) => (
                <li key={i}>
                  <strong>{e.event_type}</strong>{" "}
                  <span className="small muted">
                    {when(e.occurred_at)} · {e.source}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Async>
        <h4>Reasoner output</h4>
        <Async state={reasoning}>
          {(r: J) =>
            r ? (
              <>
                <p className="small muted">
                  Source: {r.source}
                  {r.model ? ` (${r.model})` : ""}
                  {r.rejectionReason
                    ? ` — model output not used: ${r.rejectionReason}`
                    : ""}
                </p>
                <pre>{JSON.stringify(r.output, null, 2)}</pre>
              </>
            ) : (
              <p className="muted">
                The reasoner has not run for this incident.
              </p>
            )
          }
        </Async>
        <h4>Actions, policy, approval, execution</h4>
        <Async state={actions}>
          {(a: J[]) =>
            a.length === 0 ? (
              <p className="muted">No actions proposed.</p>
            ) : (
              <ActionTrail ids={a.map((x) => x.id)} />
            )
          }
        </Async>
        <h4>Incident Passport</h4>
        <div className="row">
          <button
            className="btn sm quiet"
            onClick={async () =>
              setPassport(
                JSON.stringify(
                  await api("GET", `/incidents/${incidentId}/passport`),
                  null,
                  2,
                ),
              )
            }
          >
            Load Passport
          </button>
          {passport && (
            <a
              className="btn sm ghost"
              download={`incident-${incidentId}.passport.json`}
              href={`data:application/json;charset=utf-8,${encodeURIComponent(passport)}`}
            >
              Download
            </a>
          )}
        </div>
        <p className="small muted">
          Verify offline:{" "}
          <code>pnpm kora:verify incident-{incidentId}.passport.json</code>
        </p>
        {passport && (
          <pre>
            {passport.slice(0, 4000)}
            {passport.length > 4000 ? "\n…" : ""}
          </pre>
        )}
      </div>
    </details>
  );
}
function ActionTrail({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id) => (
        <ActionOne key={id} id={id} />
      ))}
    </>
  );
}
function ActionOne({ id }: { id: string }) {
  const a = useLoad(() => api("GET", `/api/actions/${id}`), [id], 4000);
  return (
    <Async state={a}>
      {(x: J) => (
        <pre>
          {JSON.stringify(
            {
              type: x.type,
              state: x.state,
              parameters: x.parameters,
              policyDecision: x.policyDecision,
              approval: x.approval,
              executions: x.executions,
              recoveryVerification: x.recoveryVerification,
            },
            null,
            2,
          )}
        </pre>
      )}
    </Async>
  );
}
