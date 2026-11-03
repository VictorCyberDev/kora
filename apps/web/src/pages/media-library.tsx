import { useRef, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { api, uploadMedia, type J } from "../api";
import { Async, Notice, errText, useLoad } from "../ui";

const ROLE_LABEL: Record<string, string> = {
  product: "A product",
  service: "Our work or service",
  portfolio: "Portfolio",
  team: "People",
  location: "The place",
  environment: "The space",
  process: "How we make it",
  gallery: "General gallery",
  general: "Not sure",
};

/** Owner-facing media library: logo and photos in plain words. No technical metadata is shown. */
export function MediaLibraryPanel({ siteId }: { siteId: string }) {
  const lib = useLoad(
    () => api<J>("GET", `/api/sites/${siteId}/media-library`),
    [siteId],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      lib.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  const addPhotos = (files: FileList | null) => {
    if (!files?.length) return;
    void run(async () => {
      const results: string[] = [];
      for (const f of Array.from(files).slice(0, 12)) {
        try {
          const r = await uploadMedia(siteId, f, "photo");
          results.push(`${f.name}: ${r.advice?.[0] ?? "added"}`);
        } catch (x) {
          results.push(`${f.name}: ${errText(x)}`);
        }
      }
      setMsg({ ok: true, text: results.join("  ·  ") });
    }, "Added.");
  };
  const [draft, setDraft] = useState<string | null>(null);
  /** New designs pick up the library automatically; this makes one now. The live site is never changed. */
  const rebuild = () =>
    void run(async () => {
      const site = await api<J>("GET", `/api/sites/${siteId}`);
      const description = String(site.description ?? "").trim();
      if (description.length < 12)
        throw new Error(
          "Add a sentence about what your business does in Settings first, then try again.",
        );
      const r = await api<J>("POST", `/api/sites/${siteId}/generate`, {
        name: site.name,
        description,
      });
      setDraft(String(r.version?.id ?? ""));
    }, "A new draft was made with your pictures. Your live website has not changed.");
  const setFocal = (id: string, e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 100) / 100;
    const y = Math.round(((e.clientY - r.top) / r.height) * 100) / 100;
    void run(async () => {
      await api("PATCH", `/api/sites/${siteId}/media-library/${id}`, {
        focal: { x, y },
      });
    }, "Saved. New designs will keep this part of the picture in view.");
  };
  return (
    <section className="card stack" aria-labelledby="ml-h">
      <h2 id="ml-h">Your logo and photos</h2>
      <p className="muted">
        Real pictures make your website and posters look like yours. Add them
        any time: Kora starts without them and gets stronger with them.
      </p>
      <Async state={lib}>
        {(d) => {
          const logo = d.items.find((x: J) => x.kind === "logo");
          const photos = d.items.filter((x: J) => x.kind === "photo");
          return (
            <div className="stack">
              {!d.designsCanUse && (
                <Notice kind="info">
                  Pictures are saved, but this Kora is not set up to show them
                  on published sites yet.
                </Notice>
              )}
              <div className="row" style={{ alignItems: "center", gap: 16 }}>
                {logo ? (
                  <img
                    src={logo.thumbUrl}
                    alt="Your logo"
                    style={{
                      height: 56,
                      maxWidth: 200,
                      objectFit: "contain",
                      background: "#f4f4f4",
                      padding: 6,
                    }}
                  />
                ) : (
                  <span className="muted">No logo yet</span>
                )}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      void run(async () => {
                        await uploadMedia(siteId, f, "logo");
                      }, "Logo saved. Posters and new designs will use it.");
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn sm ghost"
                  disabled={busy}
                  onClick={() => logoInput.current?.click()}
                >
                  {logo ? "Replace logo" : "Upload logo"}
                </button>
                {logo && (
                  <button
                    className="btn sm quiet"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(
                          "DELETE",
                          `/api/sites/${siteId}/media-library/${logo.id}`,
                        );
                      }, "Logo removed from new designs.")
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div>
                <input
                  ref={photoInput}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => photoInput.current?.click()}
                >
                  Add photos
                </button>
                <span className="small muted">
                  {" "}
                  PNG, JPEG or WebP, up to 8 MB each.
                </span>
              </div>
              {photos.length > 0 && (
                <ul
                  className="row"
                  style={{
                    listStyle: "none",
                    padding: 0,
                    alignItems: "flex-start",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  {photos.map((p: J) => (
                    <li key={p.id} style={{ width: 200 }} className="stack">
                      <button
                        className="plain"
                        style={{
                          position: "relative",
                          padding: 0,
                          border: "1px solid #ccc",
                          display: "block",
                          width: 200,
                          height: 140,
                          overflow: "hidden",
                          cursor: "crosshair",
                        }}
                        aria-label={`Click to choose the most important part of this picture`}
                        onClick={(e) => setFocal(p.id, e)}
                      >
                        <img
                          src={p.thumbUrl}
                          alt={p.alt || ROLE_LABEL[p.role] || "Photo"}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                        />
                        <span
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: `${p.focal.x * 100}%`,
                            top: `${p.focal.y * 100}%`,
                            width: 16,
                            height: 16,
                            margin: -8,
                            borderRadius: "50%",
                            border: "2px solid #fff",
                            boxShadow: "0 0 0 2px #000",
                          }}
                        />
                      </button>
                      <label className="small">
                        What is it?
                        <select
                          value={p.role}
                          disabled={busy}
                          onChange={(e) =>
                            void run(async () => {
                              await api(
                                "PATCH",
                                `/api/sites/${siteId}/media-library/${p.id}`,
                                { role: e.target.value },
                              );
                            }, "Saved.")
                          }
                        >
                          {d.roles.map((r: string) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="small muted">{p.advice?.[0]}</span>
                      <button
                        className="btn sm quiet"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await api(
                              "DELETE",
                              `/api/sites/${siteId}/media-library/${p.id}`,
                            );
                          }, "Removed from new designs. Anything already published keeps it.")
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {(photos.length > 0 || logo) && (
                <p>
                  <button className="btn sm" disabled={busy} onClick={rebuild}>
                    Make a new website draft with these
                  </button>{" "}
                  {draft && (
                    <Link
                      className="btn sm ghost"
                      to={`/app/sites/${siteId}/build`}
                    >
                      Compare and publish
                    </Link>
                  )}
                </p>
              )}
              {photos.length > 0 && (
                <p className="small muted">
                  Click a picture to mark the part that matters most. Kora keeps
                  it in view on phones, posters and stories.
                </p>
              )}
            </div>
          );
        }}
      </Async>
      {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
    </section>
  );
}
