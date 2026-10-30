import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, money } from "../api";
import { useAuth } from "../auth";
import { Async, Notice, Status, errText, useLoad } from "../ui";

export function Landing() {
  const plans = useLoad(() => api("GET", "/api/billing/plans"));
  return (
    <>
      <section className="landing-hero">
        <div className="wrap stack">
          <h1>
            Build your website.
            <br />
            Kora keeps it running.
          </h1>
          <p className="lead">
            Build and launch your business website with AI. Kora stays after
            launch — monitoring it, explaining problems, safely recovering from
            failures and verifying that customers can reach you again.
          </p>
          <div className="row">
            <Link className="btn" to="/signup">
              Build my website
            </Link>
            <a className="btn ghost" href="#recovery">
              See how recovery works
            </a>
          </div>
        </div>
      </section>
      <section className="band alt" id="how">
        <div className="wrap">
          <h2>One system, from first draft to a website that stays up</h2>
          <div className="grid">
            {[
              [
                "Build",
                "Describe your business in plain words. Kora writes the pages, you preview them on desktop, tablet and phone, and change anything by asking.",
              ],
              [
                "Launch",
                "Publish to a real address in one click. Every publish is a saved version, so going back is always one step.",
              ],
              [
                "Operate",
                "Kora checks your website around the clock and tells you in plain language whether customers can reach it.",
              ],
              [
                "Recover",
                "When something breaks, Kora explains what it knows and what it doesn't, suggests a safe fix, and asks before it changes anything that matters.",
              ],
              [
                "Proof",
                "A fix only counts once Kora has watched your website work again. Every step is recorded, and you can export a tamper-evident report.",
              ],
            ].map(([t, d], i) => (
              <div className="card step" key={t}>
                <span className="n">{i + 1}</span>
                <h3>{t}</h3>
                <p className="muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="band" id="recovery">
        <div className="wrap grid" style={{ alignItems: "center" }}>
          <div className="stack">
            <h2>When something breaks, you get the truth — not a guess</h2>
            <p>
              Kora never claims a cause the evidence does not show. It tells you
              what happened, when it began, what changed around that time, and
              what it still doesn't know. It only calls a fix successful after
              new checks pass.
            </p>
            <p className="muted">
              Developers get the same facts in Proof view: evidence, diagnosis,
              the policy decision, the approval, and a report you can verify
              offline.
            </p>
          </div>
          <div
            className="card stack"
            aria-label="Example of a recovery timeline"
          >
            <Status kind="bad">Needs attention</Status>
            <p className="small muted" style={{ margin: 0 }}>
              Illustration of the flow, not live data.
            </p>
            <ol className="timeline">
              <li>
                <strong>Kora saw repeated errors</strong>
                <div className="small muted">
                  Your website is reachable, but the application is returning an
                  internal error.
                </div>
              </li>
              <li>
                <strong>Recommended: restore the previous version</strong>
                <div className="small muted">
                  Approval required — it changes what customers see.
                </div>
              </li>
              <li>
                <strong>Fix applied — verifying</strong>
              </li>
              <li>
                <Status kind="ok">Website restored</Status>
                <div className="small muted">
                  Recovery verified by new checks.
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>
      <section className="band alt">
        <div className="wrap stack">
          <h2>Plans</h2>
          <Async state={plans}>
            {(
              rows: Array<{
                code: string;
                name: string;
                amountMinor: number;
                currency: string;
                interval: string;
                capabilities: Record<string, number | boolean>;
              }>,
            ) => (
              <div className="grid">
                {rows.map((p) => (
                  <PlanCard key={p.code} p={p} />
                ))}
              </div>
            )}
          </Async>
          <p className="muted small">
            Prices shown are whatever this Kora is configured with.
          </p>
        </div>
      </section>
    </>
  );
}

type Plan = {
  code: string;
  name: string;
  amountMinor: number;
  currency: string;
  interval: string;
  capabilities: Record<string, number | boolean>;
};
export function PlanCard({ p, action }: { p: Plan; action?: React.ReactNode }) {
  const c = p.capabilities;
  return (
    <div className="card stack">
      <h3>{p.name}</h3>
      <div className="mono" style={{ fontSize: "1.5rem" }}>
        {p.amountMinor === 0 ? "Free" : money(p.amountMinor, p.currency)}
        <span className="small muted">
          {p.interval === "none"
            ? ""
            : ` / ${p.interval === "monthly" ? "month" : "year"}`}
        </span>
      </div>
      <ul className="muted" style={{ paddingLeft: 18, margin: 0 }}>
        <li>
          {String(c.sites)} website{c.sites === 1 ? "" : "s"}
        </li>
        <li>{c.customDomain ? "Your own domain" : "Kora address only"}</li>
        <li>
          {c.managedRecovery
            ? "Guided recovery"
            : "Monitoring and explanations"}
        </li>
        <li>{String(c.aiOperationsPerMonth)} AI operations / month</li>
        <li>
          {String(c.teamMembers)} team member{c.teamMembers === 1 ? "" : "s"}
        </li>
      </ul>
      {action}
    </div>
  );
}

export function Pricing() {
  const plans = useLoad(() => api("GET", "/api/billing/plans"));
  return (
    <div className="wrap" style={{ padding: "40px 20px" }}>
      <div className="stack">
        <h1>Pricing</h1>
        <Async state={plans}>
          {(rows: Plan[]) =>
            rows.length === 0 ? (
              <Notice>No plans are configured on this Kora yet.</Notice>
            ) : (
              <div className="grid">
                {rows.map((p) => (
                  <PlanCard
                    key={p.code}
                    p={p}
                    action={
                      <Link className="btn sm" to="/signup">
                        Start free
                      </Link>
                    }
                  />
                ))}
              </div>
            )
          }
        </Async>
      </div>
    </div>
  );
}

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
  const loc = useLocation();
  const { refresh } = useAuth();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      await api(
        "POST",
        `/api/auth/${mode}`,
        mode === "login"
          ? { email: f.get("email"), password: f.get("password") }
          : {
              email: f.get("email"),
              password: f.get("password"),
              displayName: f.get("displayName"),
              orgName: f.get("orgName"),
            },
      );
      await refresh();
      nav(
        mode === "signup"
          ? "/app/sites/new"
          : ((loc.state as { from?: string } | null)?.from ?? "/app"),
      );
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wrap narrow" style={{ padding: "48px 20px" }}>
      <form className="card stack" onSubmit={submit}>
        <h1 style={{ fontSize: "2rem" }}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </h1>
        {mode === "signup" && (
          <>
            <label>
              Your name
              <input
                name="displayName"
                required
                maxLength={80}
                autoComplete="name"
              />
            </label>
            <label>
              Business name
              <input
                name="orgName"
                required
                maxLength={120}
                autoComplete="organization"
              />
            </label>
          </>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={mode === "signup" ? 10 : 1}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
          {mode === "signup" && (
            <span className="field-hint">At least 10 characters.</span>
          )}
        </label>
        {err && <Notice kind="bad">{err}</Notice>}
        <button className="btn" disabled={busy}>
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </button>
        <p className="small muted">
          {mode === "login" ? (
            <>
              New here? <Link to="/signup">Create an account</Link>
            </>
          ) : (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
export const Login = () => <AuthForm mode="login" />;
export const Signup = () => <AuthForm mode="signup" />;

const Legal = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="wrap narrow" style={{ padding: "40px 20px" }}>
    <div className="stack">
      <h1>{title}</h1>
      <Notice kind="warn">
        This is a plain-language draft that describes how Kora behaves today.
        Have it reviewed by counsel before relying on it.
      </Notice>
      {children}
    </div>
  </div>
);
export const Privacy = () => (
  <Legal title="Privacy">
    <p>
      Kora stores your account details, the websites you build, the messages
      visitors send through your contact forms, and the health checks and
      incidents for your websites.
    </p>
    <p>
      Passwords are stored only as salted hashes. Kora does not sell your data.
      Text you ask the AI to work on is sent to the inference provider this Kora
      is configured with, and nothing else about your account is.
    </p>
    <p>You can ask the operator of your Kora to export or delete your data.</p>
  </Legal>
);
export const Terms = () => (
  <Legal title="Terms">
    <p>
      Kora is provided as is. It monitors the websites you publish and may
      propose changes to them; it only makes changes that its policy allows or
      that you approve.
    </p>
    <p>
      You are responsible for the content of your website. If a payment fails,
      your websites stay online and monitored during a grace period; afterwards
      changes are restricted, but your websites are not deleted.
    </p>
  </Legal>
);
