import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, when, type J } from "../api";
import { Async, Notice, Status, errText, useLoad } from "../ui";

const WIDTHS = { Desktop: "100%", Tablet: "768px", Phone: "390px" } as const;
const COLOURS: Array<[string, string]> = [
  ["Blue", "#1f4fd8"],
  ["Green", "#2a9d4a"],
  ["Red", "#d62828"],
  ["Orange", "#f77f00"],
  ["Purple", "#7b2cbf"],
  ["Teal", "#0f9d9a"],
  ["Navy", "#14284b"],
];

export function Build() {
  const { id } = useParams();
  const versions = useLoad(() => api("GET", `/api/sites/${id}/versions`), [id]);
  const site = useLoad(() => api("GET", `/api/sites/${id}`), [id]);
  const [sel, setSel] = useState<string | null>(null);
  const [device, setDevice] = useState<keyof typeof WIDTHS>("Desktop");
  const [log, setLog] = useState<Array<{ who: "me" | "kora"; text: string }>>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list: J[] = versions.data ?? [];
  const current = sel ?? site.data?.currentVersionId ?? list[0]?.id ?? null;

  const say = (who: "me" | "kora", text: string) =>
    setLog((l) => [...l, { who, text }]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    setNotice(null);
    try {
      await fn();
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  const edit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const instruction = String(
      new FormData(form).get("instruction") ?? "",
    ).trim();
    if (!instruction) return;
    say("me", instruction);
    void run(async () => {
      try {
        const r = await api("POST", `/api/sites/${id}/edit`, {
          instruction,
          baseVersionId: current,
        });
        say(
          "kora",
          `Done — saved as version ${r.version.number}.${r.note ? ` (${r.note})` : ""}`,
        );
        setSel(r.version.id);
        form.reset();
        versions.reload();
        site.reload();
      } catch (x) {
        if (x instanceof ApiError && x.code === "edit_not_applied") {
          say("kora", x.message);
          return;
        }
        throw x;
      }
    });
  };
  const colour = (value: string) =>
    void run(async () => {
      const r = await api("POST", `/api/sites/${id}/edit`, {
        baseVersionId: current,
        edit: { kind: "brand", field: "primaryColor", value },
      });
      say(
        "kora",
        `Primary colour changed — saved as version ${r.version.number}.`,
      );
      setSel(r.version.id);
      versions.reload();
      site.reload();
    });
  const publish = (versionId: string, rollback = false) =>
    void run(async () => {
      const r = await api(
        "POST",
        `/api/sites/${id}/versions/${versionId}/${rollback ? "rollback" : "publish"}`,
      );
      setNotice(
        `${rollback ? "Restored" : "Published"}: ${r.publicUrl}${r.verification?.status === "MATCH" ? " — live copy verified." : ""}`,
      );
      versions.reload();
      site.reload();
    });
  const live = site.data?.publishedVersionId as string | null | undefined;
  const liveNumber = list.find((v) => v.id === live)?.number;

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "minmax(280px, 380px) 1fr",
        alignItems: "start",
      }}
    >
      <div className="stack">
        <div className="card stack">
          <h3>Ask Kora to change something</h3>
          <div className="stack" aria-live="polite">
            {log.map((m, i) => (
              <div key={i} className={`bubble ${m.who === "me" ? "me" : ""}`}>
                {m.text}
              </div>
            ))}
          </div>
          <form className="stack" onSubmit={edit}>
            <label>
              Your request
              <textarea
                name="instruction"
                placeholder="Make the primary colour blue"
                maxLength={1000}
              />
            </label>
            <button className="btn" disabled={busy}>
              {busy ? "Working…" : "Apply change"}
            </button>
          </form>
          <p className="small muted">
            Simple edits (colours, button text, adding a service, renaming) work
            without AI. Bigger rewrites need the AI model to be configured.
          </p>
          <div>
            <span className="small muted">Primary colour</span>
            <div className="row" role="group" aria-label="Primary colour">
              {COLOURS.map(([n, c]) => (
                <button
                  key={c}
                  className="btn sm quiet"
                  disabled={busy}
                  onClick={() => colour(c)}
                  aria-label={`Set primary colour to ${n}`}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      background: c,
                      display: "inline-block",
                    }}
                  />
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <h3>Versions</h3>
          <Async state={versions}>
            {(rows: J[]) => (
              <table>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <button
                          className="btn sm quiet"
                          aria-pressed={v.id === current}
                          onClick={() => setSel(v.id)}
                        >
                          v{v.number}
                        </button>
                      </td>
                      <td className="small">
                        {v.id === live ? (
                          <Status kind="ok">Live</Status>
                        ) : (
                          v.state.toLowerCase()
                        )}
                        <div className="muted">
                          {when(v.createdAt)} ·{" "}
                          {v.generationSource
                            .toLowerCase()
                            .replaceAll("_", " ")}
                        </div>
                      </td>
                      <td>
                        {v.id !== live &&
                          (liveNumber &&
                          v.number < liveNumber &&
                          v.publishStatus === "PUBLISHED" ? (
                            <button
                              className="btn sm ghost"
                              disabled={busy}
                              onClick={() => publish(v.id, true)}
                            >
                              Restore
                            </button>
                          ) : (
                            <button
                              className="btn sm ghost"
                              disabled={busy}
                              onClick={() => publish(v.id)}
                            >
                              Publish
                            </button>
                          ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Async>
        </div>
      </div>
      <div className="stack">
        {err && <Notice kind="bad">{err}</Notice>}
        {notice && <Notice kind="ok">{notice}</Notice>}
        <div className="row between">
          <div className="seg" role="group" aria-label="Preview size">
            {(Object.keys(WIDTHS) as Array<keyof typeof WIDTHS>).map((d) => (
              <button
                key={d}
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
              >
                {d}
              </button>
            ))}
          </div>
          {current && current !== live && (
            <button
              className="btn"
              disabled={busy}
              onClick={() => publish(current)}
            >
              Publish this version
            </button>
          )}
          {current && current === live && (
            <Status kind="ok">This version is live</Status>
          )}
        </div>
        {current ? (
          <iframe
            key={current}
            className="frame"
            title="Website preview"
            style={{ maxWidth: WIDTHS[device] }}
            src={`/api/sites/${id}/versions/${current}/preview/`}
            sandbox="allow-same-origin"
          />
        ) : (
          <Notice>Create a first version to see a preview.</Notice>
        )}
        <p className="small muted">
          The preview shows exactly the saved files that publishing deploys.
        </p>
      </div>
    </div>
  );
}
