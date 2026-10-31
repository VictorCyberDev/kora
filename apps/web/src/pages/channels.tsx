import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, when, type J } from "../api";
import { Async, Notice, Status, errText, useLoad } from "../ui";

const SUPPORT: Record<string, string> = {
  supported: "Yes",
  limited: "Limited",
  unsupported: "No",
};
const CAP_LABEL: Record<string, string> = {
  publish: "Post",
  schedule: "Schedule",
  analytics: "Results",
  messages: "Messages",
  profile: "Profile",
  reviews: "Reviews",
};
const STATE: Record<
  string,
  { kind: "ok" | "warn" | "bad" | "wait"; text: string }
> = {
  CONNECTED: { kind: "ok", text: "Connected" },
  AUTH_EXPIRED: { kind: "bad", text: "Sign in again" },
  PERMISSION_REQUIRED: { kind: "bad", text: "More permission needed" },
  RATE_LIMITED: { kind: "warn", text: "Slowed by the provider" },
  DEGRADED: { kind: "warn", text: "Having trouble" },
  DISCONNECTED: { kind: "wait", text: "Not connected" },
  NOT_SUPPORTED: { kind: "wait", text: "Not supported" },
};

function ChannelCard({
  siteId,
  c,
  reload,
}: {
  siteId: string;
  c: J;
  reload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [phoneId, setPhoneId] = useState("");
  const conn = c.connection;
  const unavailable = c.availability === "planned";
  const notSetUp = !unavailable && c.runtime.state === "NOT_CONFIGURED";
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const connect = () =>
    run(async () => {
      const r = await api<J>(
        "POST",
        `/api/sites/${siteId}/channels/${c.provider}/connect`,
        c.provider === "whatsapp" && phoneId
          ? { externalAccountId: phoneId }
          : {},
      );
      window.location.assign(r.authorizeUrl);
    });
  return (
    <li className="k-check stack" aria-label={c.label}>
      <div className="row between">
        <h3>{c.label}</h3>
        {conn ? (
          <Status kind={STATE[conn.state]?.kind ?? "wait"}>
            {STATE[conn.state]?.text ?? conn.state}
          </Status>
        ) : unavailable ? (
          <Status kind="wait">Coming later</Status>
        ) : notSetUp ? (
          <Status kind="wait">Not set up yet</Status>
        ) : (
          <Status kind="wait">Not connected</Status>
        )}
      </div>
      {conn && (
        <p className="muted">
          {conn.mode === "SANDBOX" ? "Test account · " : ""}
          {conn.accountName ?? "Connected"}
          {conn.lastCheckedAt ? ` · checked ${when(conn.lastCheckedAt)}` : ""}
        </p>
      )}
      <dl className="k-caps">
        {Object.entries(c.capabilities).map(([k, v]) => (
          <div key={k}>
            <dt>{CAP_LABEL[k] ?? k}</dt>
            <dd data-support={String(v)}>{SUPPORT[String(v)]}</dd>
          </div>
        ))}
      </dl>
      <ul className="k-notes">
        {c.notes.map((n: string) => (
          <li key={n} className="muted">
            {n}
          </li>
        ))}
      </ul>
      {c.platformApproval && (
        <p className="muted">Platform approval needed: {c.platformApproval}</p>
      )}
      {notSetUp && (
        <Notice kind="info">
          The Kora operator has not added the {c.label} app credentials yet
          {c.runtime.missing.length ? ` (${c.runtime.missing.join(", ")})` : ""}
          . Nothing is faked: this channel stays unavailable until they do.
        </Notice>
      )}
      {c.provider === "whatsapp" && !conn && !notSetUp && !unavailable && (
        <label>
          WhatsApp phone number ID
          <input
            inputMode="numeric"
            value={phoneId}
            onChange={(e) => setPhoneId(e.target.value.replace(/\D/g, ""))}
            placeholder="From Meta Business settings"
          />
        </label>
      )}
      {err && <Notice kind="bad">{err}</Notice>}
      <div className="row">
        {!conn && !unavailable && !notSetUp && (
          <button className="btn sm" disabled={busy} onClick={connect}>
            Connect {c.label}
          </button>
        )}
        {conn && conn.state !== "CONNECTED" && !notSetUp && (
          <button className="btn sm" disabled={busy} onClick={connect}>
            Sign in again
          </button>
        )}
        {conn && (
          <>
            <button
              className="btn sm ghost"
              disabled={busy}
              onClick={() =>
                run(() =>
                  api(
                    "POST",
                    `/api/sites/${siteId}/channels/${c.provider}/check`,
                  ),
                )
              }
            >
              Check now
            </button>
            <button
              className="btn sm quiet"
              disabled={busy}
              onClick={() =>
                run(() =>
                  api(
                    "POST",
                    `/api/sites/${siteId}/channels/${c.provider}/disconnect`,
                  ),
                )
              }
            >
              Disconnect
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function ChannelsPage() {
  const { id } = useParams();
  const [q] = useSearchParams();
  const data = useLoad(() => api<J>("GET", `/api/sites/${id}/channels`), [id]);
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Channels</p>
        <h2>Where your business shows up</h2>
        <p className="muted">
          Connect the accounts you already use. Kora only reads and posts what
          you allow, and shows you exactly what each channel can and cannot do.
        </p>
        {q.get("connected") && <Notice kind="ok">Connected.</Notice>}
        {q.get("problem") && <Notice kind="bad">{q.get("problem")}</Notice>}
      </section>
      <Async state={data}>
        {(d) => (
          <>
            {d.sandbox && (
              <Notice kind="warn">
                Test mode: channels connect to fake accounts. Nothing is sent to
                real platforms.
              </Notice>
            )}
            <ul className="k-checks">
              {d.channels.map((c: J) => (
                <ChannelCard
                  key={c.provider}
                  siteId={id!}
                  c={c}
                  reload={data.reload}
                />
              ))}
            </ul>
          </>
        )}
      </Async>
    </div>
  );
}
