import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type J } from "../api";
import { Async, Notice, Status, errText, useLoad } from "../ui";

function Result({ r, share }: { r: J; share?: string }) {
  const link = share
    ? `${window.location.origin}/audit/shared?t=${encodeURIComponent(share)}`
    : null;
  return (
    <section className="card stack" aria-labelledby="audit-r">
      <p className="k-overline">Business audit</p>
      <h2 id="audit-r" style={{ margin: 0 }}>
        {r.passed} of {r.total} checks passed
      </h2>
      <p className="muted small">
        {r.url}. {r.note}
      </p>
      <ul className="k-checks">
        {r.findings.map((f: J) => (
          <li key={f.id} className="k-check">
            <Status kind={f.ok ? "ok" : "warn"}>
              {f.ok ? "Good" : "Fix this"}
            </Status>
            <div className="k-lead">
              <strong>{f.observed}</strong>
              {f.fix && <span className="muted">{f.fix}</span>}
            </div>
          </li>
        ))}
      </ul>
      {link && (
        <p className="small">
          Share this result:{" "}
          <input readOnly value={link} aria-label="Share link" size={40} />
        </p>
      )}
      <p>
        <Link className="btn" to="/signup">
          Let Kora fix these
        </Link>
      </p>
    </section>
  );
}

/** Public: audit any website's public page. No login. Shows only what the page itself says. */
export function PublicAuditPage() {
  const [res, setRes] = useState<J | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const url = String(new FormData(e.currentTarget).get("url") ?? "");
    setBusy(true);
    setErr(null);
    try {
      setRes(await api<J>("POST", "/api/public/audit", { url }));
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="wrap stack" style={{ padding: "40px 20px", maxWidth: 760 }}>
      <h1>How does your website look to a customer?</h1>
      <p className="lead">
        Paste your website address. Kora reads the public page and tells you, in
        plain words, what helps customers find and contact you and what does
        not. Nothing is changed and no login is needed.
      </p>
      <form className="row" onSubmit={go}>
        <input
          name="url"
          aria-label="Website address"
          placeholder="yourbusiness.com"
          required
          style={{ flex: 1 }}
        />
        <button className="btn" disabled={busy}>
          {busy ? "Checking…" : "Check my website"}
        </button>
      </form>
      {err && <Notice kind="bad">{err}</Notice>}
      {res && <Result r={res} share={res.shareToken} />}
    </div>
  );
}

export function SharedAuditPage() {
  const [q] = useSearchParams();
  const t = q.get("t") ?? "";
  const r = useLoad(
    () => api<J>("GET", `/api/public/audit/shared?t=${encodeURIComponent(t)}`),
    [t],
  );
  return (
    <div className="wrap stack" style={{ padding: "40px 20px", maxWidth: 760 }}>
      <Async state={r}>{(x) => <Result r={x} />}</Async>
    </div>
  );
}
