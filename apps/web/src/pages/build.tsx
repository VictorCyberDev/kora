import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError, when, type J } from "../api";
import {
  BUTTONS,
  DENSITIES,
  FONT_LABEL,
  PALETTE_LABEL,
  SECTION_LABEL,
  SHAPES,
  variantLabel,
} from "../design-labels";
import { Async, Notice, Status, errText, useLoad } from "../ui";

const WIDTHS = { Desktop: "100%", Tablet: "768px", Phone: "390px" } as const;
type Tab = "chat" | "design" | "sections" | "versions";

export function Build() {
  const { id } = useParams();
  const versions = useLoad(() => api("GET", `/api/sites/${id}/versions`), [id]);
  const site = useLoad(() => api("GET", `/api/sites/${id}`), [id]);
  const catalog = useLoad(() => api("GET", "/api/design/catalog"));
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [device, setDevice] = useState<keyof typeof WIDTHS>("Desktop");
  const [log, setLog] = useState<Array<{ who: "me" | "kora"; text: string }>>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list: J[] = versions.data ?? [];
  const current = sel ?? site.data?.currentVersionId ?? list[0]?.id ?? null;
  const detail = useLoad(
    () =>
      current
        ? api("GET", `/api/sites/${id}/versions/${current}`)
        : Promise.resolve(null),
    [id, current],
  );
  const spec: J | null = detail.data?.spec ?? null;
  const isV2 = spec?.version === 2;

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
  /** Every change is a validated edit that becomes a new immutable version. */
  const change = (body: Record<string, unknown>, done: string) =>
    void run(async () => {
      try {
        const r = await api("POST", `/api/sites/${id}/edit`, {
          baseVersionId: current,
          ...body,
        });
        say("kora", `${done} Saved as version ${r.version.number}.`);
        setSel(r.version.id);
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
  const design = (designEdit: Record<string, unknown>, done: string) =>
    change({ designEdit }, done);
  const chat = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const instruction = String(
      new FormData(form).get("instruction") ?? "",
    ).trim();
    if (!instruction) return;
    say("me", instruction);
    change({ instruction }, "Done.");
    form.reset();
  };
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
  const upgrade = () =>
    void run(async () => {
      const r = await api(
        "POST",
        `/api/sites/${id}/versions/${current}/upgrade`,
        {},
      );
      say(
        "kora",
        `Made a new draft with the updated design (version ${r.version.number}). Your live site has not changed. ${r.notCarried?.length ? r.notCarried.join(" ") : ""}`,
      );
      setSel(r.version.id);
      setTab("chat");
      versions.reload();
    });
  const live = site.data?.publishedVersionId as string | null | undefined;
  const liveNumber = list.find((v) => v.id === live)?.number;
  const home = spec?.pages?.find((p: J) => p.slug === "home");

  return (
    <div className="studio">
      <div className="studio-side">
        <div className="card">
          <div className="tabs" role="tablist" aria-label="Editor">
            {(
              [
                ["chat", "Ask Kora"],
                ["design", "Design"],
                ["sections", "Sections"],
                ["versions", "Versions"],
              ] as Array<[Tab, string]>
            ).map(([t, l]) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {l}
              </button>
            ))}
          </div>

          {tab === "chat" && (
            <div className="stack">
              <div className="stack" aria-live="polite">
                {log.length === 0 && (
                  <p className="muted small">
                    Ask for a change in your own words, or use the Design and
                    Sections tabs. Every change is saved as a new version you
                    can go back to.
                  </p>
                )}
                {log.map((m, i) => (
                  <div
                    key={i}
                    className={`bubble ${m.who === "me" ? "me" : ""}`}
                  >
                    {m.text}
                  </div>
                ))}
              </div>
              <form className="stack" onSubmit={chat}>
                <label>
                  Your request
                  <textarea
                    name="instruction"
                    placeholder="Make the main colour teal"
                    maxLength={1000}
                  />
                </label>
                <button className="btn" disabled={busy}>
                  {busy ? "Working…" : "Apply change"}
                </button>
              </form>
              <p className="small muted">
                Colours, button text, adding a service and renaming work without
                AI. Bigger rewrites need the AI model.
              </p>
              {spec && !isV2 && (
                <Notice kind="info">
                  This version uses the earlier design.{" "}
                  <button className="btn sm" disabled={busy} onClick={upgrade}>
                    Upgrade design
                  </button>
                  <div className="small">
                    Makes a new draft with the same content. Your live site does
                    not change until you publish it.
                  </div>
                </Notice>
              )}
            </div>
          )}

          {tab === "design" &&
            (isV2 && catalog.data ? (
              <div className="stack">
                <div className="ctl">
                  <span>Colours</span>
                  <div className="chips" role="group" aria-label="Colours">
                    {catalog.data.palettes.map((p: J) => (
                      <button
                        key={p.id}
                        className="chip"
                        aria-pressed={spec.design.paletteStrategy === p.id}
                        disabled={busy}
                        onClick={() =>
                          design(
                            { kind: "palette", strategy: p.id },
                            `Colours changed to ${PALETTE_LABEL[p.id] ?? p.id}.`,
                          )
                        }
                      >
                        <span className="sw" aria-hidden="true">
                          {p.swatches.map((c: string) => (
                            <i key={c} style={{ background: c }} />
                          ))}
                        </span>
                        {PALETTE_LABEL[p.id] ?? p.id}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ctl">
                  <span>Type</span>
                  <div className="chips" role="group" aria-label="Type">
                    {catalog.data.fonts.map((f: J) => (
                      <button
                        key={f.id}
                        className="chip"
                        aria-pressed={spec.design.typography.pairing === f.id}
                        disabled={busy}
                        onClick={() =>
                          design(
                            { kind: "font", pairing: f.id },
                            `Type changed to ${FONT_LABEL[f.id] ?? f.id}.`,
                          )
                        }
                      >
                        {FONT_LABEL[f.id] ?? f.id}
                      </button>
                    ))}
                  </div>
                </div>
                {(
                  [
                    ["Corners", "shape", SHAPES],
                    ["Spacing", "density", DENSITIES],
                    ["Buttons", "buttons", BUTTONS],
                  ] as Array<[string, string, Array<[string, string]>]>
                ).map(([label, key, opts]) => (
                  <div className="ctl" key={key}>
                    <span>{label}</span>
                    <div className="seg" role="group" aria-label={label}>
                      {opts.map(([v, l]) => (
                        <button
                          key={v}
                          aria-pressed={spec.design[key] === v}
                          disabled={busy}
                          onClick={() =>
                            design({ kind: key, value: v }, `${label} updated.`)
                          }
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <label className="ctl">
                  <span>Header</span>
                  <select
                    value={spec.design.nav}
                    disabled={busy}
                    onChange={(e) =>
                      design(
                        { kind: "nav", value: e.target.value },
                        "Header changed.",
                      )
                    }
                  >
                    {catalog.data.variants.nav.map((v: string) => (
                      <option key={v} value={v}>
                        {variantLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ctl">
                  <span>Footer</span>
                  <select
                    value={spec.design.footer}
                    disabled={busy}
                    onChange={(e) =>
                      design(
                        { kind: "footer", value: e.target.value },
                        "Footer changed.",
                      )
                    }
                  >
                    {catalog.data.variants.footer.map((v: string) => (
                      <option key={v} value={v}>
                        {variantLabel(v)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <Notice>
                Design controls are available on the updated design. Open the
                Ask Kora tab to upgrade this version.
              </Notice>
            ))}

          {tab === "sections" &&
            (isV2 && home && catalog.data ? (
              <ul className="seclist">
                {home.sections.map((s: J, i: number) => (
                  <li key={`${s.type}-${i}`}>
                    <div className="top">
                      <strong>{SECTION_LABEL[s.type] ?? s.type}</strong>
                      <span className="row">
                        <button
                          className="btn sm quiet"
                          aria-label={`Move ${SECTION_LABEL[s.type]} up`}
                          disabled={busy || i === 0}
                          onClick={() =>
                            design(
                              {
                                kind: "section-move",
                                page: "home",
                                from: i,
                                to: i - 1,
                              },
                              "Section moved.",
                            )
                          }
                        >
                          ↑
                        </button>
                        <button
                          className="btn sm quiet"
                          aria-label={`Move ${SECTION_LABEL[s.type]} down`}
                          disabled={busy || i === home.sections.length - 1}
                          onClick={() =>
                            design(
                              {
                                kind: "section-move",
                                page: "home",
                                from: i,
                                to: i + 1,
                              },
                              "Section moved.",
                            )
                          }
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                    <label className="ctl">
                      <span>Layout</span>
                      <select
                        value={s.variant}
                        disabled={busy}
                        onChange={(e) =>
                          design(
                            {
                              kind: "section-variant",
                              page: "home",
                              index: i,
                              value: e.target.value,
                            },
                            "Layout changed.",
                          )
                        }
                      >
                        {(catalog.data.variants[s.type] as string[]).map(
                          (v) => (
                            <option key={v} value={v}>
                              {variantLabel(v)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <div className="row">
                      <button
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() =>
                          design(
                            { kind: "section-shuffle", page: "home", index: i },
                            "Tried another layout.",
                          )
                        }
                      >
                        Try another layout
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() =>
                          design(
                            {
                              kind: "section-duplicate",
                              page: "home",
                              index: i,
                            },
                            "Section duplicated.",
                          )
                        }
                      >
                        Duplicate
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() =>
                          design(
                            { kind: "section-delete", page: "home", index: i },
                            "Section removed.",
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Notice>
                Section controls are available on the updated design.
              </Notice>
            ))}

          {tab === "versions" && (
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
          )}
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
            className="frame tall"
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
