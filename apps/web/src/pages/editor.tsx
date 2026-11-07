import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError, type J } from "../api";
import { Async, Notice, Spinner, errText, useLoad } from "../ui";

/**
 * Visual editor. Every control sends one validated SiteSpec operation to the server, which applies it through the same
 * schema as generation and stores the result as a new immutable draft version. There is no HTML or code editing here: the
 * owner changes words, lists, pictures, order and pages, and the design stays the one they chose.
 */

const MAX_PAGES = 7;
const WIDTHS = { Desktop: 1280, Phone: 390 } as const;
const FRAME_HEIGHT = { Desktop: 760, Phone: 780 } as const;
const ADDABLE_PAGES: Array<[string, string]> = [
  ["about", "About"],
  ["faq", "Questions"],
  ["approach", "How we work"],
  ["gallery", "Gallery"],
];
const ADDABLE_SECTIONS: Array<[string, string]> = [
  ["story", "A story"],
  ["faq", "Questions and answers"],
  ["process", "Steps to get started"],
  ["offer", "What you offer"],
  ["gallery", "Pictures"],
  ["statement", "A statement"],
  ["cta", "A call to action"],
];
const TYPE_LABEL: Record<string, string> = {
  hero: "Opening",
  ticker: "Highlights",
  statement: "Statement",
  offer: "What you offer",
  products: "Products",
  story: "Story",
  process: "Steps",
  gallery: "Pictures",
  proof: "Reviews",
  visit: "Visit",
  contact: "Contact form",
  faq: "Questions",
  cta: "Call to action",
};
const REWRITABLE = new Set([
  "story",
  "faq",
  "process",
  "offer",
  "gallery",
  "cta",
  "statement",
]);
const LOCKED = new Set(["hero", "contact"]);

type Pick = { page: string; index: number; item?: number } | null;

export function EditorPage() {
  const { id } = useParams();
  const site = useLoad(() => api("GET", `/api/sites/${id}`), [id]);
  const versions = useLoad(() => api("GET", `/api/sites/${id}/versions`), [id]);
  const [headId, setHeadId] = useState<string | null>(null);
  const list: J[] = versions.data ?? [];
  const head = headId ?? site.data?.currentVersionId ?? list[0]?.id ?? null;
  const detail = useLoad(
    () =>
      head
        ? api("GET", `/api/sites/${id}/versions/${head}`)
        : Promise.resolve(null),
    [id, head],
  );
  const [slug, setSlug] = useState("home");
  const [open, setOpen] = useState<number | null>(null);
  const [device, setDevice] = useState<keyof typeof WIDTHS>("Desktop");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick>(null);
  const [previewKey, setPreviewKey] = useState(0);
  // The desktop preview is the real 1280px layout, scaled to fit the space available; the phone preview is 390px as is.
  const box = useRef<HTMLElement | null>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () =>
      setFit(
        device === "Desktop"
          ? Math.min(1, Math.max(0.3, (el.clientWidth - 24) / WIDTHS.Desktop))
          : 1,
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device, detail.data]);

  const spec: J | null = detail.data?.spec ?? null;
  const isV3 = spec?.version === 3;
  const pages: J[] = spec?.pages ?? [];
  const page: J | undefined = pages.find((p) => p.slug === slug) ?? pages[0];
  const headNumber =
    list.find((v) => v.id === head)?.number ?? detail.data?.number;
  const liveId: string | null = site.data?.publishedVersionId ?? null;

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
  /** One validated operation; the result is saved as a new draft version and the preview refreshes. */
  const edit = (designEdit: Record<string, unknown>, done: string) =>
    run(async () => {
      const r = await api("POST", `/api/sites/${id}/edit`, {
        baseVersionId: head,
        designEdit,
      });
      setHeadId(r.version.id);
      setPreviewKey((k) => k + 1);
      setNotice(`${done} Saved as draft ${r.version.number}.`);
      versions.reload();
      site.reload();
    });
  const restore = (versionId: string, label: string) =>
    run(async () => {
      const r = await api(
        "POST",
        `/api/sites/${id}/versions/${versionId}/restore-draft`,
        {},
      );
      setHeadId(r.version.id);
      setPreviewKey((k) => k + 1);
      setNotice(
        `${label} Saved as draft ${r.version.number}. Nothing is live until you publish.`,
      );
      versions.reload();
    });
  const publish = () =>
    run(async () => {
      if (!head) return;
      const r = await api("POST", `/api/sites/${id}/versions/${head}/publish`);
      setNotice(
        `Published${r.verification?.status === "MATCH" ? " and checked: the live site matches this draft" : ""}. ${r.publicUrl ?? ""}`,
      );
      site.reload();
      versions.reload();
    });

  const idx = list.findIndex((v) => v.id === head);
  const previous: J | undefined = idx >= 0 ? list[idx + 1] : undefined;
  const previewSrc =
    head && page
      ? `/api/sites/${id}/versions/${head}/preview/${page.slug === "home" ? "" : `${page.slug}/`}?k=${previewKey}`
      : null;

  return (
    <div className="ed" data-testid="visual-editor">
      {site.error && <Notice kind="bad">{site.error}</Notice>}
      {head && !detail.data && !detail.error ? (
        <Spinner />
      ) : detail.error ? (
        <Notice kind="bad">{detail.error}</Notice>
      ) : (
        <>
          {!spec ? (
            <Notice>
              Create a first version of your website before editing it.
            </Notice>
          ) : !isV3 ? (
            <Notice kind="warn">
              This website was made with an earlier design system. The visual
              editor works on newer designs; you can still edit it in{" "}
              <Link to={`/app/sites/${id}/build`}>Build</Link>, or ask Kora for
              a new design there.
            </Notice>
          ) : (
            <>
              <div className="ed-bar">
                <strong data-testid="draft-label">Draft {headNumber}</strong>
                {head === liveId && <span className="pill ok">Live</span>}
                <button
                  className="btn sm ghost"
                  disabled={busy || !previous}
                  onClick={() =>
                    previous &&
                    void restore(
                      previous.id,
                      `Undone: back to draft ${previous.number}.`,
                    )
                  }
                  data-testid="undo"
                >
                  Undo
                </button>
                <details className="ed-versions">
                  <summary className="btn sm ghost">Earlier versions</summary>
                  <ul>
                    {list.slice(0, 12).map((v) => (
                      <li key={v.id}>
                        <span>
                          Version {v.number}
                          {v.id === liveId ? " (live)" : ""}
                          {v.id === head ? " (shown)" : ""}
                        </span>
                        <button
                          className="btn sm ghost"
                          disabled={busy || v.id === head}
                          onClick={() =>
                            void restore(v.id, `Restored version ${v.number}.`)
                          }
                        >
                          Restore
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
                <span className="grow" />
                <div role="group" aria-label="Preview size" className="seg">
                  {(Object.keys(WIDTHS) as Array<keyof typeof WIDTHS>).map(
                    (d) => (
                      <button
                        key={d}
                        aria-pressed={device === d}
                        onClick={() => setDevice(d)}
                        className="btn sm ghost"
                      >
                        {d}
                      </button>
                    ),
                  )}
                </div>
                <button
                  className="btn sm"
                  disabled={busy || !head}
                  onClick={() => void publish()}
                  data-testid="publish"
                >
                  Publish this draft
                </button>
              </div>
              {err && <Notice kind="bad">{err}</Notice>}
              {notice && <Notice kind="ok">{notice}</Notice>}
              <p className="muted small" data-testid="review-note">
                Read every page before you publish. The wording is drafted from
                what you told us, so check that it is true of your business and
                replace any picture that is not yours.
              </p>

              <div className="ed-grid">
                <aside className="ed-pages" aria-label="Pages">
                  <h3>Pages</h3>
                  <p className="muted small">
                    {pages.length} of {MAX_PAGES}
                  </p>
                  <ol>
                    {pages.map((p, i) => (
                      <li
                        key={p.slug}
                        className={p.slug === page?.slug ? "on" : ""}
                      >
                        <button
                          className="ed-pagebtn"
                          onClick={() => {
                            setSlug(p.slug);
                            setOpen(null);
                          }}
                          data-testid={`page-${p.slug}`}
                        >
                          {p.nav ?? p.title}
                        </button>
                        <span className="ed-mini">
                          <button
                            aria-label={`Move ${p.nav ?? p.title} up`}
                            disabled={busy || i < 2}
                            onClick={() =>
                              void edit(
                                { kind: "move-page", slug: p.slug, to: i - 1 },
                                "Moved the page.",
                              )
                            }
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`Move ${p.nav ?? p.title} down`}
                            disabled={
                              busy || p.slug === "home" || i >= pages.length - 2
                            }
                            onClick={() =>
                              void edit(
                                { kind: "move-page", slug: p.slug, to: i + 1 },
                                "Moved the page.",
                              )
                            }
                          >
                            ↓
                          </button>
                          <button
                            aria-label={`Remove ${p.nav ?? p.title}`}
                            disabled={
                              busy || p.slug === "home" || p.slug === "contact"
                            }
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Remove the "${p.nav ?? p.title}" page? You can undo this.`,
                                )
                              ) {
                                setSlug("home");
                                void edit(
                                  { kind: "remove-page", slug: p.slug },
                                  "Removed the page.",
                                );
                              }
                            }}
                          >
                            ×
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <label className="field-hint" htmlFor="add-page">
                    Add a page
                  </label>
                  <select
                    id="add-page"
                    disabled={busy || pages.length >= MAX_PAGES}
                    value=""
                    onChange={(e) =>
                      e.target.value &&
                      void edit(
                        { kind: "add-page", page: e.target.value },
                        "Added the page.",
                      )
                    }
                    data-testid="add-page"
                  >
                    <option value="">
                      {pages.length >= MAX_PAGES
                        ? "Limit reached (7 pages)"
                        : "Choose…"}
                    </option>
                    {ADDABLE_PAGES.filter(
                      ([k]) => !pages.some((p) => p.slug === k),
                    ).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <SaveInput
                    label="Search title"
                    value={spec.seo.title}
                    max={70}
                    disabled={busy}
                    onSave={(v) =>
                      edit({ kind: "seo", title: v }, "Saved the search title.")
                    }
                  />
                  <SaveInput
                    label="Search description"
                    value={spec.seo.description}
                    max={180}
                    multiline
                    disabled={busy}
                    onSave={(v) =>
                      edit(
                        { kind: "seo", description: v },
                        "Saved the search description.",
                      )
                    }
                  />
                </aside>

                <section className="ed-preview" aria-label="Preview" ref={box}>
                  <div
                    className="ed-frame"
                    style={{
                      width: WIDTHS[device] * fit,
                      height: FRAME_HEIGHT[device] * fit,
                    }}
                  >
                    {previewSrc && (
                      <iframe
                        key={previewSrc}
                        title={`Preview of ${page?.title}`}
                        src={previewSrc}
                        // Kora's own rendered artifact (its CSP allows only its own script). Scripts run so reveal animations show.
                        sandbox="allow-same-origin allow-scripts"
                        style={{
                          width: WIDTHS[device],
                          height: FRAME_HEIGHT[device],
                          transform: `scale(${fit})`,
                        }}
                        data-testid="preview"
                      />
                    )}
                  </div>
                </section>

                <aside className="ed-panel" aria-label="Edit this page">
                  {page && (
                    <>
                      <h3>{page.title}</h3>
                      <div className="ed-row">
                        <SaveInput
                          label="Page title"
                          value={page.title}
                          max={80}
                          disabled={busy}
                          onSave={(v) =>
                            edit(
                              { kind: "page-meta", page: page.slug, title: v },
                              "Saved the page title.",
                            )
                          }
                        />
                        <SaveInput
                          label="Menu label"
                          value={page.nav ?? page.title}
                          max={30}
                          disabled={busy}
                          onSave={(v) =>
                            edit(
                              { kind: "page-meta", page: page.slug, nav: v },
                              "Saved the menu label.",
                            )
                          }
                        />
                      </div>

                      <ol className="ed-sections">
                        {page.sections.map((s: J, i: number) => (
                          <li
                            key={`${i}-${s.type}`}
                            className={open === i ? "open" : ""}
                          >
                            <div className="ed-sechead">
                              <button
                                className="ed-secbtn"
                                aria-expanded={open === i}
                                onClick={() => setOpen(open === i ? null : i)}
                                data-testid={`section-${i}`}
                              >
                                <span className="tag">
                                  {TYPE_LABEL[s.type] ?? s.type}
                                </span>{" "}
                                {summary(s)}
                              </button>
                              <span className="ed-mini">
                                <button
                                  aria-label="Move section up"
                                  disabled={busy || i < 2 || LOCKED.has(s.type)}
                                  onClick={() =>
                                    void edit(
                                      {
                                        kind: "move-section",
                                        page: page.slug,
                                        from: i,
                                        to: i - 1,
                                      },
                                      "Moved the section.",
                                    )
                                  }
                                >
                                  ↑
                                </button>
                                <button
                                  aria-label="Move section down"
                                  disabled={
                                    busy ||
                                    LOCKED.has(s.type) ||
                                    i >= page.sections.length - 1
                                  }
                                  onClick={() =>
                                    void edit(
                                      {
                                        kind: "move-section",
                                        page: page.slug,
                                        from: i,
                                        to: i + 1,
                                      },
                                      "Moved the section.",
                                    )
                                  }
                                >
                                  ↓
                                </button>
                                {REWRITABLE.has(s.type) && (
                                  <button
                                    aria-label="Rewrite this section"
                                    disabled={busy}
                                    title="Write it again from what Kora knows"
                                    onClick={() =>
                                      void edit(
                                        {
                                          kind: "regenerate-section",
                                          page: page.slug,
                                          index: i,
                                        },
                                        "Rewrote the section.",
                                      )
                                    }
                                  >
                                    ↻
                                  </button>
                                )}
                                <button
                                  aria-label="Remove section"
                                  disabled={busy || LOCKED.has(s.type)}
                                  onClick={() =>
                                    void edit(
                                      {
                                        kind: "remove-section",
                                        page: page.slug,
                                        index: i,
                                      },
                                      "Removed the section.",
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </span>
                            </div>
                            {open === i && (
                              <SectionFields
                                s={s}
                                page={page.slug}
                                index={i}
                                busy={busy}
                                edit={edit}
                                onPick={(item) =>
                                  setPick({
                                    page: page.slug,
                                    index: i,
                                    ...(item !== undefined ? { item } : {}),
                                  })
                                }
                              />
                            )}
                          </li>
                        ))}
                      </ol>
                      <div className="ed-add">
                        <select
                          aria-label="Add a section"
                          disabled={busy}
                          value=""
                          onChange={(e) =>
                            e.target.value &&
                            void edit(
                              {
                                kind: "add-section",
                                page: page.slug,
                                section: e.target.value,
                              },
                              "Added the section.",
                            )
                          }
                          data-testid="add-section"
                        >
                          <option value="">Add a section…</option>
                          {ADDABLE_SECTIONS.map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <button
                          className="btn sm ghost"
                          disabled={busy}
                          onClick={() =>
                            void edit(
                              { kind: "regenerate-page", page: page.slug },
                              "Rewrote the page.",
                            )
                          }
                          data-testid="regenerate-page"
                        >
                          Rewrite this page
                        </button>
                      </div>
                      <p className="muted small">
                        Rewriting changes the words, never the design or your
                        own pictures. Anything you do can be undone.
                      </p>
                    </>
                  )}
                </aside>
              </div>
              {pick && (
                <PicturePicker
                  siteId={String(id)}
                  pick={pick}
                  onClose={() => setPick(null)}
                  onChoose={(media, token) => {
                    const p = pick;
                    setPick(null);
                    void edit(
                      {
                        kind: "replace-media",
                        page: p.page,
                        index: p.index,
                        ...(p.item !== undefined ? { item: p.item } : {}),
                        media,
                        ...(token ? { selectionToken: token } : {}),
                      },
                      "Replaced the picture.",
                    );
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function summary(s: J): string {
  const t =
    s.heading ??
    s.text ??
    s.items?.[0]?.title ??
    s.items?.[0]?.question ??
    s.body?.[0] ??
    "";
  return String(t).slice(0, 48);
}

/** A labelled text field that saves when the person presses Save, not on every keystroke. The label is bound to the input. */
function SaveInput({
  label,
  value,
  max,
  multiline,
  disabled,
  onSave,
}: {
  label: string;
  value: string;
  max: number;
  multiline?: boolean;
  disabled?: boolean;
  onSave: (v: string) => void;
}) {
  const id = useId();
  const [v, setV] = useState(value);
  // A different page, section or version supplies a new value: the field follows it instead of keeping stale text.
  useEffect(() => setV(value), [value]);
  const changed = v.trim() !== value.trim() && v.trim().length > 0;
  const common = {
    id,
    value: v,
    maxLength: max,
    disabled,
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
  };
  return (
    <div className="ed-field">
      <label htmlFor={id}>{label}</label>
      <div className="ed-save">
        {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
        <button
          className="btn sm"
          disabled={disabled || !changed}
          onClick={() => onSave(v.trim())}
          aria-label={`Save ${label.toLowerCase()}`}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function SectionFields({
  s,
  page,
  index,
  busy,
  edit,
  onPick,
}: {
  s: J;
  page: string;
  index: number;
  busy: boolean;
  edit: (e: Record<string, unknown>, done: string) => Promise<void>;
  onPick: (item?: number) => void;
}) {
  const textEdit = (field: Record<string, unknown>) =>
    edit({ kind: "section-text", page, index, ...field }, "Saved your words.");
  const listed = ["offer", "products", "process", "faq"].includes(s.type);
  const priced = s.type === "offer" || s.type === "products";
  const faq = s.type === "faq";
  const hasPicture = (x: J) => !!(x?.media || x?.plate);
  return (
    <div className="ed-fields">
      {"heading" in s && s.type !== "gallery" && (
        <>
          <SaveInput
            label="Heading"
            value={s.heading ?? ""}
            max={120}
            disabled={busy}
            onSave={(v) => void textEdit({ heading: v })}
          />
        </>
      )}
      {s.type === "hero" && (
        <>
          <SaveInput
            label="Subheading"
            value={s.subheading ?? ""}
            max={280}
            multiline
            disabled={busy}
            onSave={(v) => void textEdit({ subheading: v })}
          />
        </>
      )}
      {"intro" in s && s.type !== "hero" && (
        <>
          <SaveInput
            label="Introduction"
            value={s.intro ?? ""}
            max={300}
            multiline
            disabled={busy}
            onSave={(v) => void textEdit({ intro: v })}
          />
        </>
      )}
      {s.type === "story" &&
        (s.body as string[]).map((b, k) => (
          <div key={k}>
            <SaveInput
              label={`Paragraph ${k + 1}`}
              value={b}
              max={900}
              multiline
              disabled={busy}
              onSave={(v) =>
                void textEdit({
                  body: (s.body as string[]).map((x, j) => (j === k ? v : x)),
                })
              }
            />
          </div>
        ))}
      {s.type === "statement" && (
        <p className="muted small">
          A statement is one sentence of your own. Use Rewrite to build it again
          from your description.
        </p>
      )}
      {(s.type === "hero" || s.type === "story") && hasPicture(s) && (
        <button
          className="btn sm ghost"
          disabled={busy}
          onClick={() => onPick()}
          data-testid="replace-picture"
        >
          Change the picture…
        </button>
      )}
      {listed && (
        <ol className="ed-items">
          {(s.items as J[]).map((it, k) => (
            <li key={k}>
              <SaveInput
                label={faq ? "Question" : "Name"}
                value={it[faq ? "question" : "title"] ?? ""}
                max={200}
                disabled={busy}
                onSave={(v) =>
                  void edit(
                    {
                      kind: "item",
                      page,
                      index,
                      action: "update",
                      item: k,
                      title: v,
                    },
                    "Saved.",
                  )
                }
              />
              <SaveInput
                label={faq ? "Answer" : "Description"}
                value={it[faq ? "answer" : "text"] ?? ""}
                max={faq ? 700 : 400}
                multiline
                disabled={busy}
                onSave={(v) =>
                  void edit(
                    {
                      kind: "item",
                      page,
                      index,
                      action: "update",
                      item: k,
                      text: v,
                    },
                    "Saved.",
                  )
                }
              />
              {priced && (
                <>
                  <SaveInput
                    label="Price (only if you want to show one)"
                    value={it.price ?? ""}
                    max={40}
                    disabled={busy}
                    onSave={(v) =>
                      void edit(
                        {
                          kind: "item",
                          page,
                          index,
                          action: "update",
                          item: k,
                          price: v,
                        },
                        "Saved.",
                      )
                    }
                  />
                </>
              )}
              <div className="row">
                {hasPicture(it) && (
                  <button
                    className="btn sm ghost"
                    disabled={busy}
                    onClick={() => onPick(k)}
                  >
                    Change picture…
                  </button>
                )}
                <button
                  className="btn sm ghost"
                  disabled={
                    busy ||
                    (s.items as J[]).length <= (s.type === "process" ? 2 : 1)
                  }
                  onClick={() =>
                    void edit(
                      { kind: "item", page, index, action: "remove", item: k },
                      "Removed the item.",
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
          <AddItem
            faq={faq}
            busy={busy}
            onAdd={(title, text) =>
              void edit(
                { kind: "item", page, index, action: "add", title, text },
                "Added the item.",
              )
            }
          />
        </ol>
      )}
      {s.type === "gallery" && (
        <ul className="ed-thumbs">
          {(s.items as J[]).map((it, k) => (
            <li key={k}>
              {it.media ? (
                <img src={it.media.url} alt={it.media.alt} />
              ) : (
                <span className="ph" />
              )}
              <button
                className="btn sm ghost"
                disabled={busy}
                onClick={() => onPick(k)}
              >
                Replace…
              </button>
            </li>
          ))}
        </ul>
      )}
      {s.type === "cta" && (
        <p className="muted small">
          The button label for every call to action is set in Build ("make the
          button say…").
        </p>
      )}
    </div>
  );
}

function AddItem({
  faq,
  busy,
  onAdd,
}: {
  faq: boolean;
  busy: boolean;
  onAdd: (title: string, text: string) => void;
}) {
  const [t, setT] = useState("");
  const [x, setX] = useState("");
  const idT = useId();
  const idX = useId();
  return (
    <li className="ed-additem">
      <label htmlFor={idT}>{faq ? "New question" : "New item"}</label>
      <input
        id={idT}
        value={t}
        maxLength={200}
        onChange={(e) => setT(e.target.value)}
      />
      <label htmlFor={idX}>
        {faq
          ? "Answer to the new question"
          : "Description of the new item (optional)"}
      </label>
      <textarea
        id={idX}
        rows={2}
        value={x}
        maxLength={faq ? 700 : 400}
        onChange={(e) => setX(e.target.value)}
      />
      <button
        className="btn sm"
        disabled={busy || !t.trim() || (faq && !x.trim())}
        onClick={() => {
          onAdd(t.trim(), x.trim());
          setT("");
          setX("");
        }}
      >
        Add
      </button>
    </li>
  );
}

/** Pictures from every available source. A stock picture only becomes placeable after the person selects it here. */
function PicturePicker({
  siteId,
  pick,
  onClose,
  onChoose,
}: {
  siteId: string;
  pick: NonNullable<Pick>;
  onClose: () => void;
  onChoose: (media: J, token?: string) => void;
}) {
  const [tab, setTab] = useState<"kora" | "mine" | "stock">("kora");
  const cat = useLoad(
    () => api("GET", `/api/sites/${siteId}/media/catalogue`),
    [siteId],
  );
  const own = useLoad(
    () => api("GET", `/api/sites/${siteId}/media/owner`),
    [siteId],
  );
  const [stock, setStock] = useState<{
    items: J[] | null;
    error: string | null;
    busy: boolean;
  }>({ items: null, error: null, busy: false });
  const searchStock = async () => {
    setStock({ items: null, error: null, busy: true });
    try {
      const r = await api("POST", `/api/sites/${siteId}/media/candidates`, {});
      setStock({
        items: r.candidates,
        error: r.candidates.length
          ? null
          : "No suggestions came back. Try again later.",
        busy: false,
      });
    } catch (x) {
      setStock({
        items: null,
        error:
          x instanceof ApiError && x.status === 503
            ? "Stock suggestions are not switched on for this account yet."
            : errText(x),
        busy: false,
      });
    }
  };
  const chooseStock = async (c: J) => {
    try {
      const r = await api("POST", `/api/sites/${siteId}/media/select`, {
        candidateToken: c.candidateToken,
      });
      onChoose(r.media, r.selectionToken);
    } catch (x) {
      setStock((s) => ({ ...s, error: errText(x) }));
    }
  };
  const media = (m: J) => ({
    url: m.url,
    alt: m.alt,
    ...(m.width ? { width: m.width } : {}),
    ...(m.height ? { height: m.height } : {}),
    role: "feature",
    treatment: "none",
  });
  const ownerMedia = (m: J) => ({
    ...media(m),
    provenance: {
      sourceType: "owner-supplied",
      reviewStatus: "owner-approved",
    },
  });
  const catalogMedia = (m: J) => ({
    ...media(m),
    provenance: {
      sourceType: "licensed-stock",
      provider: "Pexels",
      reviewStatus: "kora-curated",
    },
  });
  const tabs = useMemo(
    () =>
      [
        ["kora", "Kora's pictures"],
        ["mine", "My photos"],
        ["stock", "Stock suggestions"],
      ] as const,
    [],
  );
  return (
    <div
      className="ed-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a picture"
    >
      <div className="ed-modal-card">
        <div className="row between">
          <h3>Choose a picture</h3>
          <button className="btn sm ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div role="tablist" className="seg">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className="btn sm ghost"
              onClick={() => setTab(k)}
            >
              {l}
            </button>
          ))}
        </div>
        {tab === "kora" && (
          <Async state={cat}>
            {(items: J[]) => (
              <ul className="ed-choices">
                {items.map((m) => (
                  <li key={m.url}>
                    <button
                      onClick={() => onChoose(catalogMedia(m))}
                      title={m.alt}
                      data-testid="choose-catalogue"
                    >
                      <img src={m.url} alt={m.alt} loading="lazy" />
                    </button>
                    <span className="muted small">{m.credit}</span>
                  </li>
                ))}
              </ul>
            )}
          </Async>
        )}
        {tab === "mine" && (
          <Async state={own}>
            {(d: J) =>
              d.items.length === 0 ? (
                <p className="muted">
                  You have not added any photos yet. Add some in{" "}
                  <Link to={`/app/sites/${siteId}/images`}>Images</Link>.
                </p>
              ) : (
                <>
                  {d.note && <Notice kind="warn">{d.note}</Notice>}
                  <ul className="ed-choices">
                    {d.items.map((m: J) => (
                      <li key={m.id}>
                        <button
                          disabled={!m.url}
                          onClick={() => onChoose(ownerMedia(m))}
                          title={m.alt || "Your photo"}
                        >
                          <img
                            src={m.thumbUrl}
                            alt={m.alt || "Your photo"}
                            loading="lazy"
                          />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )
            }
          </Async>
        )}
        {tab === "stock" && (
          <div>
            <p className="muted small">
              Suggestions from a stock-photo provider. You choose each picture
              yourself, and the photographer is credited on your site.
            </p>
            {!stock.items && (
              <button
                className="btn sm"
                disabled={stock.busy}
                onClick={() => void searchStock()}
              >
                {stock.busy ? "Searching…" : "Find suggestions"}
              </button>
            )}
            {stock.error && <Notice kind="warn">{stock.error}</Notice>}
            {stock.items && (
              <ul className="ed-choices">
                {stock.items.map((c) => (
                  <li key={`${c.provider}:${c.id}`}>
                    <button
                      onClick={() => void chooseStock(c)}
                      title={c.description}
                    >
                      <img
                        src={c.previewUrl}
                        alt={c.description}
                        loading="lazy"
                      />
                    </button>
                    <span className="muted small">{c.attribution}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <p className="muted small">
          Placing a picture {pick.item !== undefined ? "in this item" : "here"}{" "}
          replaces the current one. You can undo it.
        </p>
      </div>
    </div>
  );
}
