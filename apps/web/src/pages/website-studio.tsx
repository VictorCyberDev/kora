/**
 * Website Studio: Puck edits SiteSpec pages, but does not replace the
 * authoritative SiteSpec renderer or immutable version store.
 * The toolbar's Save Draft button goes through Kora's existing protected
 * /edit endpoint. Site publishing remains a separate owner action.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Puck, type Config, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { api, type J } from "../api";
import { Async, Notice, errText, useLoad } from "../ui";
import { MediaLibraryPanel } from "./media-library";

type EditProps = {
  id?: string;
  original: string;
  heading: string;
  subheading: string;
  body: string;
  imageUrl: string;
  buttonLabel: string;
  buttonHref: string;
  itemsText: string;
  layout: string;
};
type ComponentName =
  | "Hero"
  | "Statement"
  | "Offer"
  | "Products"
  | "Story"
  | "Contact"
  | "CTA"
  | "Process"
  | "FAQ"
  | "Gallery"
  | "Visit"
  | "Existing";
const names: Record<string, ComponentName> = {
  hero: "Hero",
  statement: "Statement",
  offer: "Offer",
  products: "Products",
  story: "Story",
  contact: "Contact",
  cta: "CTA",
  process: "Process",
  faq: "FAQ",
  gallery: "Gallery",
  visit: "Visit",
};
const blockRender = (p: EditProps) => (
  <section
    style={{
      padding: "clamp(32px,6vw,92px) 5vw",
      margin: "12px",
      background: "#fffaf2",
      color: "#171319",
    }}
  >
    {p.imageUrl ? (
      <img
        src={p.imageUrl}
        alt=""
        style={{
          width: "100%",
          maxHeight: 340,
          objectFit: "cover",
          marginBottom: 24,
        }}
      />
    ) : null}
    <h2 style={{ fontSize: "clamp(2rem,5vw,4.5rem)", lineHeight: 1.08 }}>
      {p.heading}
    </h2>
    {p.subheading ? <p style={{ fontSize: "1.1rem" }}>{p.subheading}</p> : null}
    {p.body ? <p>{p.body}</p> : null}
    {p.itemsText ? (
      <div style={{ whiteSpace: "pre-line", lineHeight: 1.7 }}>
        {p.itemsText}
      </div>
    ) : null}
    {p.buttonLabel ? (
      <span
        style={{
          display: "inline-block",
          padding: "12px 20px",
          background: "#171319",
          color: "white",
        }}
      >
        {p.buttonLabel}
      </span>
    ) : null}
  </section>
);
function defaultSection(type: ComponentName): J {
  if (type === "Hero")
    return {
      type: "hero",
      layout: "type-dominant",
      heading: "New headline",
      subheading: "",
      highlights: [],
      variant: 0,
    };
  if (type === "Statement")
    return {
      type: "statement",
      layout: "large",
      text: "Introduce this part of your business.",
    };
  if (type === "Story")
    return {
      type: "story",
      layout: "craft",
      heading: "Our story",
      body: ["Tell customers about the business."],
      values: [],
    };
  if (type === "Contact")
    return {
      type: "contact",
      layout: "enquiry-form",
      heading: "Contact",
      intro: "",
      form: false,
      formFields: ["name", "email", "message"],
      submitLabel: "Send message",
    };
  if (type === "Process")
    return {
      type: "process",
      layout: "horizontal-steps",
      heading: "How it works",
      intro: "",
      items: [
        { title: "First step", text: "Describe the first step" },
        { title: "Next step", text: "Describe the next step" },
      ],
    };
  if (type === "FAQ")
    return {
      type: "faq",
      layout: "accordion",
      heading: "Questions",
      items: [
        {
          question: "How can I contact you?",
          answer: "Use the contact options on this website.",
        },
      ],
    };
  if (type === "CTA")
    return {
      type: "cta",
      layout: "outline",
      heading: "Get in touch",
      body: "",
      button: { label: "Contact us", href: "/" },
    };
  throw new Error("New sections of this type require business content first.");
}
function dataProps(section: J, id: string): EditProps {
  return {
    id,
    original: JSON.stringify(section),
    heading:
      section.heading ??
      (section.type === "statement" ? section.text : section.type),
    subheading: section.subheading ?? section.intro ?? "",
    body:
      section.type === "story"
        ? (section.body ?? []).join("\n")
        : (section.body ?? ""),
    imageUrl: section.media?.url ?? "",
    buttonLabel: section.button?.label ?? section.primaryCta?.label ?? "",
    buttonHref: section.button?.href ?? section.primaryCta?.href ?? "",
    layout: section.layout ?? "",
    itemsText:
      section.type === "faq"
        ? (section.items ?? [])
            .map((it: J) => [it.question, it.answer].join(" | "))
            .join("\n")
        : section.type === "gallery"
          ? (section.items ?? []).map((it: J) => it.caption ?? "").join("\n")
          : (section.items ?? [])
              .map((it: J) => [it.title, it.text].filter(Boolean).join(" | "))
              .join("\n"),
  };
}
function toPuck(page: J): Data {
  return {
    root: { props: { title: page.title } },
    content: page.sections.map((section: J, index: number) => ({
      type: names[section.type] ?? "Existing",
      props: dataProps(section, `kora-${index}-${section.type}`),
    })),
  };
}
/** Rehydrate existing validated sections; never allow the editor to supply executable markup. */
function fromPuck(data: Data, ownerPhotos: J[], knownMedia: J[]): J[] {
  return data.content.map((component) => {
    const p = component.props as unknown as EditProps;
    if (!p.original)
      throw new Error("A new section needs a supported source template.");
    const section: J = JSON.parse(p.original);
    if ((names[section.type] ?? "Existing") !== component.type)
      throw new Error("Unsupported section conversion.");
    if (p.layout && p.layout !== section.layout) section.layout = p.layout;
    switch (section.type) {
      case "hero":
        section.heading = p.heading;
        section.subheading = p.subheading;
        if (section.primaryCta && p.buttonLabel)
          section.primaryCta.label = p.buttonLabel;
        if (section.primaryCta && p.buttonHref)
          section.primaryCta.href = p.buttonHref;
        break;
      case "statement":
        section.text = p.heading;
        break;
      case "offer":
      case "products":
      case "process":
        section.heading = p.heading;
        section.intro = p.subheading;
        if (p.itemsText.trim()) {
          const existing = section.items ?? [];
          section.items = p.itemsText
            .split("\n")
            .map((line: string, index: number) => {
              const [rawTitle, ...description] = line.split(" | ");
              const title = (rawTitle ?? "").trim();
              const old = existing[index] ?? {};
              const next = {
                ...old,
                title,
                text: description.join(" | ").trim(),
              };
              if (old.title && old.title !== title) {
                delete next.media;
                delete next.plate;
              }
              return next;
            })
            .filter((item: J) => item.title);
        }
        break;
      case "story":
        section.heading = p.heading;
        section.body = p.body
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "faq": {
        section.heading = p.heading;
        section.items = p.itemsText
          .split("\n")
          .map((line: string) => {
            const [question, ...answer] = line.split(" | ");
            return {
              question: (question ?? "").trim(),
              answer: answer.join(" | ").trim(),
            };
          })
          .filter((item: J) => item.question && item.answer);
        break;
      }
      case "gallery":
        section.heading = p.heading;
        section.items = section.items.map((item: J, index: number) => ({
          ...item,
          caption: (p.itemsText.split("\n")[index] ?? item.caption ?? "").slice(
            0,
            120,
          ),
        }));
        break;
      case "visit":
        section.heading = p.heading;
        section.intro = p.subheading;
        break;
      case "contact":
        section.heading = p.heading;
        section.intro = p.subheading;
        break;
      case "cta":
        section.heading = p.heading;
        section.body = p.body;
        section.button.label = p.buttonLabel;
        if (p.buttonHref) section.button.href = p.buttonHref;
        break;
    }
    if (p.imageUrl && p.imageUrl !== section.media?.url) {
      const owner = ownerPhotos.find((x) => x.url === p.imageUrl);
      const existing = knownMedia.find((media) => media.url === p.imageUrl);
      if (!owner && !existing)
        throw new Error(
          "Choose a photo from this site's approved asset library.",
        );
      section.media = existing
        ? {
            ...existing,
            role: section.type === "hero" ? "hero" : "feature",
          }
        : {
            url: owner.url,
            alt: owner.alt || "Customer uploaded photo",
            width: owner.width,
            height: owner.height,
            focalPoint: owner.focal,
            role: section.type === "hero" ? "hero" : "feature",
            treatment: "none",
            provenance: {
              sourceType: "owner-supplied",
              reviewStatus: "owner-approved",
            },
          };
      delete section.plate;
    }
    return section;
  });
}
const defaults = (type: ComponentName) => {
  try {
    return dataProps(defaultSection(type), "");
  } catch {
    return dataProps(
      { type: "statement", layout: "large", text: "Existing section" },
      "",
    );
  }
};
function createWebsiteConfig(ownerPhotos: J[], pages: J[]): Config {
  const sources = new Map<string, string>();
  for (const p of pages)
    for (const section of p.sections) {
      if (section.media?.url)
        sources.set(
          section.media.url,
          section.media.alt || "Existing approved image",
        );
      for (const item of section.items ?? [])
        if (item.media?.url)
          sources.set(
            item.media.url,
            item.media.alt || "Existing approved image",
          );
    }
  for (const photo of ownerPhotos)
    if (photo.url) sources.set(photo.url, photo.alt || "Uploaded photo");
  const imageField = {
    type: "select" as const,
    label: "Image from approved library",
    options: [
      { label: "No change / no image", value: "" },
      ...[...sources].map(([value, label]) => ({
        value,
        label: label.slice(0, 85),
      })),
    ],
  };
  const layoutField = (values: string[]) => ({
    type: "select" as const,
    label: "Section layout",
    options: values.map((value) => ({
      value,
      label: value.replace(/-/g, " "),
    })),
  });
  const headingFields = {
    heading: { type: "text" as const, label: "Headline" },
    subheading: { type: "textarea" as const, label: "Supporting text" },
    imageUrl: imageField,
    buttonLabel: { type: "text" as const, label: "Button label" },
    buttonHref: { type: "text" as const, label: "Button link" },
    layout: layoutField([
      "cinematic",
      "editorial-split",
      "type-dominant",
      "poster",
      "menu-focus",
      "booking-focus",
      "location-focus",
      "collage",
      "arch-portrait",
      "minimal-statement",
      "ticker-energy",
      "product-dominant",
      "call-first",
    ]),
  };
  return {
    components: {
      Hero: {
        label: "Hero",
        fields: headingFields,
        defaultProps: defaults("Hero"),
        render: blockRender,
      },
      Statement: {
        label: "Statement",
        fields: { heading: { type: "textarea" } },
        defaultProps: defaults("Statement"),
        render: blockRender,
      },
      Offer: {
        label: "Services",
        fields: {
          heading: { type: "text" },
          subheading: { type: "textarea" },
          itemsText: { type: "textarea" },
          layout: layoutField([
            "editorial-index",
            "menu-list",
            "image-tiles",
            "stacked-panels",
            "accordion",
            "sticky-split",
            "board",
            "ladder",
          ]),
        },
        defaultProps: defaults("Offer"),
        render: blockRender,
        permissions: { insert: false },
      },
      Products: {
        label: "Products",
        fields: {
          heading: { type: "text" },
          subheading: { type: "textarea" },
          itemsText: { type: "textarea" },
          layout: layoutField([
            "rail",
            "gallery-grid",
            "featured-pair",
            "price-menu",
          ]),
        },
        defaultProps: defaults("Products"),
        render: blockRender,
        permissions: { insert: false },
      },
      Story: {
        label: "Story",
        fields: {
          heading: { type: "text" },
          body: { type: "textarea" },
          imageUrl: imageField,
          layout: layoutField([
            "manifesto",
            "founder-note",
            "split-image",
            "craft",
          ]),
        },
        defaultProps: defaults("Story"),
        render: blockRender,
      },
      Process: {
        label: "Process steps",
        fields: {
          heading: { type: "text" },
          subheading: { type: "textarea" },
          itemsText: { type: "textarea" },
          layout: layoutField([
            "numerals",
            "horizontal-steps",
            "timeline-line",
          ]),
        },
        defaultProps: defaults("Process"),
        render: blockRender,
      },
      FAQ: {
        label: "Questions & answers",
        fields: { heading: { type: "text" }, itemsText: { type: "textarea" } },
        defaultProps: defaults("FAQ"),
        render: blockRender,
      },
      Gallery: {
        label: "Gallery",
        fields: {
          heading: { type: "text" },
          itemsText: { type: "textarea" },
          layout: layoutField(["mosaic", "rail", "pair", "grid"]),
        },
        defaultProps: defaults("Gallery"),
        render: blockRender,
        permissions: { insert: false },
      },
      Visit: {
        label: "Visit us",
        fields: {
          heading: { type: "text" },
          subheading: { type: "textarea" },
          layout: layoutField(["card", "split"]),
        },
        defaultProps: defaults("Visit"),
        render: blockRender,
        permissions: { insert: false },
      },
      Contact: {
        label: "Contact",
        fields: {
          heading: { type: "text" },
          subheading: { type: "textarea" },
          layout: layoutField([
            "whatsapp-first",
            "call-first",
            "booking-form",
            "enquiry-form",
            "visit",
          ]),
        },
        defaultProps: defaults("Contact"),
        render: blockRender,
      },
      CTA: {
        label: "Call to action",
        fields: {
          heading: { type: "text" },
          body: { type: "textarea" },
          buttonLabel: { type: "text" },
          buttonHref: { type: "text" },
          layout: layoutField(["statement", "outline", "marquee"]),
        },
        defaultProps: defaults("CTA"),
        render: blockRender,
      },
      Existing: {
        label: "Existing section",
        fields: {},
        defaultProps: defaults("Existing"),
        render: blockRender,
        permissions: { insert: false },
      },
    },
  } as unknown as Config;
}
export function WebsiteStudio() {
  const { id } = useParams();
  const assets = useLoad(
    () => api<J>("GET", "/api/sites/" + id + "/studio-assets"),
    [id],
  );
  const versions = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/versions`),
    [id],
  );
  const site = useLoad(() => api<J>("GET", `/api/sites/${id}`), [id]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const current =
    selectedVersion ?? site.data?.currentVersionId ?? versions.data?.[0]?.id;
  const detail = useLoad(
    () =>
      current
        ? api<J>("GET", `/api/sites/${id}/versions/${current}`)
        : Promise.resolve(null),
    [id, current],
  );
  const spec = detail.data?.spec;
  const [selectedPage, setSelectedPage] = useState("home");
  const [newTitle, setNewTitle] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [showAssets, setShowAssets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [publicRelease, setPublicRelease] = useState<{url:string;verified:boolean}|null>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const page =
    spec?.pages?.find((p: J) => p.slug === selectedPage) ?? spec?.pages?.[0];
  const puckData = useMemo(() => (page ? toPuck(page) : null), [page]);
  const config = useMemo(
    () => createWebsiteConfig(assets.data?.photos ?? [], spec?.pages ?? []),
    [assets.data, spec],
  );
  async function edit(designEdit: J) {
    if (!current) throw new Error("Select an existing draft.");
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const result = await api<J>("POST", `/api/sites/${id}/edit`, {
        baseVersionId: current,
        designEdit,
      });
      setDirty(false);
      setSelectedVersion(result.version.id);
      setSaved(`Draft saved as version ${result.version.number}.`);
      versions.reload();
      site.reload();
    } catch (e) {
      setError(errText(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function releaseVersion(versionId: string, rollback = false) {
    if (dirty) { setError("Save or discard unsaved changes before publishing."); return; }
    if (!window.confirm(rollback ? "Restore this previously published version?" : "Publish this saved version to the public site?")) return;
    setPublishing(true);
    setError("");
    setPublicRelease(null);
    try {
      const response = await api<J>("POST", "/api/sites/" + id + "/versions/" + versionId + (rollback ? "/rollback" : "/publish"), {});
      const url = response.publicUrl as string;
      if (!url || !/^https?:/.test(url)) throw new Error("Publisher returned no public URL.");
      setPublicRelease({url, verified:response.verification?.status === "MATCH"});
      setSaved(rollback ? "Previously published version restored." : "Version published.");
      versions.reload();
      site.reload();
    } catch (e) { setError(errText(e)); }
    finally { setPublishing(false); }
  }
  async function createPage(e: FormEvent) {
    e.preventDefault();
    if (!spec || !newTitle.trim()) return;
    const slug = newTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const hero = spec.pages[0]?.sections.find((s: J) => s.type === "hero");
    const contact = spec.pages[0]?.sections.find(
      (s: J) => s.type === "contact",
    );
    if (!hero || !slug) {
      setError("The site requires a homepage before adding pages.");
      return;
    }
    try {
      await edit({
        kind: "create-page",
        slug,
        title: newTitle.trim(),
        purpose: "about",
        sections: [
          {
            ...hero,
            heading: newTitle.trim(),
            subheading: "",
            primaryCta: { label: "Back to home", href: "/" },
            secondaryCta: undefined,
          },
          ...(contact ? [contact] : []),
        ],
      });
      setSelectedPage(slug);
      setNewTitle("");
    } catch {
      /* The API error is displayed above. */
    }
  }
  if (!id) return <Notice kind="bad">Website ID is missing.</Notice>;
  return (
    <div className="stack">
      <header className="card row between">
        <div>
          <p className="k-overline">Kora Website Studio</p>
          <h1>Visual website editor</h1>
          <p className="muted">
            Edits create a new draft; your published site stays unchanged until
            approved.
          </p>
        </div>
        <Link className="btn ghost" to={`/app/sites/${id}/build`}>
          Versions &amp; publish
        </Link>
      </header>
      {error && <Notice kind="bad">{error}</Notice>}
      {saved && <Notice kind="ok">{saved}</Notice>}
      {publicRelease && (
        <Notice kind={publicRelease.verified ? "ok" : "warn"}>
          <a href={publicRelease.url} target="_blank" rel="noopener noreferrer">Open published website</a>
          {publicRelease.verified ? " — Live artifact verified." : " — Publication verification not confirmed."}
        </Notice>
      )}
      <section className="card stack" aria-label="Website publishing and rollback">
        <div className="row between">
          <div>
            <strong>Publish and restore</strong>
            <p className="muted">Publishing requires owner approval. Previous published versions are preserved.</p>
          </div>
          <button type="button" className="btn sm ghost" onClick={()=>setShowVersionHistory(!showVersionHistory)}>
            {showVersionHistory ? "Hide versions" : "Version history"}
          </button>
        </div>
        <div className="row">
          <button type="button" className="btn" disabled={!current || dirty || busy || publishing || spec?.version !== 3}
            onClick={()=>current && void releaseVersion(current)}>
            {publishing ? "Publishing…" : "Publish selected version"}
          </button>
          {site.data?.publishedVersionId && <span className="muted">A published version is live</span>}
        </div>
        {showVersionHistory && (versions.data ?? []).map((version:J)=>(
          <div className="row between" key={version.id}>
            <span>Version {version.number} {version.id === site.data?.publishedVersionId ? "— Live" : ""}</span>
            <div className="row">
              <button type="button" className="btn sm ghost" disabled={dirty || busy || publishing}
                onClick={()=>{setSelectedVersion(version.id);setPreview(true);}}>Review</button>
              {version.publishStatus === "PUBLISHED" && version.id !== site.data?.publishedVersionId && (
                <button type="button" className="btn sm ghost" disabled={dirty || busy || publishing}
                  onClick={()=>void releaseVersion(version.id,true)}>Restore</button>
              )}
            </div>
          </div>
        ))}
      </section>
      <Async state={detail}>
        {() =>
          !spec || spec.version !== 3 || !page || !puckData ? (
            <Notice kind="warn">
              Generate or upgrade to a SiteSpec v3 draft to use the visual
              editor.
            </Notice>
          ) : (
            <>
              <section className="card stack">
                <div className="row" role="group" aria-label="Pages">
                  {spec.pages.map((p: J) => (
                    <button
                      key={p.slug}
                      className="btn sm ghost"
                      aria-pressed={p.slug === page.slug}
                      onClick={() => {
                        if (
                          !dirty ||
                          window.confirm(
                            "Discard unsaved changes to this page?",
                          )
                        ) {
                          setDirty(false);
                          setSelectedPage(p.slug);
                        }
                      }}
                    >
                      {p.nav || p.title}
                    </button>
                  ))}
                </div>
                <form className="row" onSubmit={(e) => void createPage(e)}>
                  <label>
                    New page title{" "}
                    <input
                      value={newTitle}
                      maxLength={80}
                      onChange={(e) => setNewTitle(e.target.value)}
                    />
                  </label>
                  <button
                    className="btn sm"
                    disabled={
                      busy || spec.pages.length >= 7 || !newTitle.trim()
                    }
                  >
                    Add page
                  </button>
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={busy || page.slug === "home"}
                    onClick={() => {
                      if (window.confirm(`Delete page "${page.title}"?`))
                        void edit({ kind: "delete-page", slug: page.slug })
                          .then(() => setSelectedPage("home"))
                          .catch(() => {});
                    }}
                  >
                    Delete this page
                  </button>
                  <button
                    type="button"
                    className="btn sm quiet"
                    onClick={() => {
                      if (
                        !dirty ||
                        window.confirm(
                          "Discard unsaved changes before preview?",
                        )
                      ) {
                        setDirty(false);
                        setPreview(!preview);
                      }
                    }}
                  >
                    {preview ? "Editor" : "Actual saved preview"}
                  </button>
                </form>
                <div
                  className="row"
                  role="group"
                  aria-label="Brand colors and typography"
                >
                  <span className="muted">Brand appearance:</span>
                  {(["warmer", "cooler", "darker", "lighter"] as const).map(
                    (nudge) => (
                      <button
                        key={nudge}
                        type="button"
                        className="btn sm ghost"
                        disabled={busy}
                        onClick={() =>
                          void edit({ kind: "nudge", nudge }).catch(() => {})
                        }
                      >
                        {nudge}
                      </button>
                    ),
                  )}
                  <label>
                    Typography
                    <select
                      disabled={busy}
                      value={spec.design.genome.typeVoice}
                      onChange={(e) =>
                        void edit({
                          kind: "type-voice",
                          typeVoice: e.target.value,
                        }).catch(() => {})
                      }
                    >
                      {(
                        [
                          "editorial-luxury",
                          "modern-serif",
                          "technical-grotesk",
                          "friendly-humanist",
                          "craft-warm",
                          "minimal-modernist",
                          "poster-condensed",
                          "high-fashion",
                        ] as const
                      ).map((font) => (
                        <option key={font} value={font}>
                          {font.replace(/-/g, " ")}
                        </option>
                      ))}
                      {![
                        "editorial-luxury",
                        "modern-serif",
                        "technical-grotesk",
                        "friendly-humanist",
                        "craft-warm",
                        "minimal-modernist",
                        "poster-condensed",
                        "high-fashion",
                      ].includes(spec.design.genome.typeVoice) && (
                        <option value={spec.design.genome.typeVoice}>
                          {spec.design.genome.typeVoice.replace(/-/g, " ")}
                        </option>
                      )}
                    </select>
                  </label>
                </div>
                <div className="row" role="group" aria-label="Page actions">
                  <button
                    className="btn sm ghost"
                    disabled={busy || page.slug === "home"}
                    onClick={() =>
                      void edit({
                        kind: "reorder-page",
                        slug: page.slug,
                        to: Math.max(
                          1,
                          spec.pages.findIndex((p: J) => p.slug === page.slug) -
                            1,
                        ),
                      }).catch(() => {})
                    }
                  >
                    Move page earlier
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={busy || page.slug === "home"}
                    onClick={() =>
                      void edit({
                        kind: "reorder-page",
                        slug: page.slug,
                        to: Math.min(
                          spec.pages.length - 1,
                          spec.pages.findIndex((p: J) => p.slug === page.slug) +
                            1,
                        ),
                      }).catch(() => {})
                    }
                  >
                    Move page later
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={busy || spec.pages.length >= 7}
                    onClick={() => {
                      const slug = window.prompt(
                        "New unique URL slug for this copy",
                      );
                      if (slug)
                        void edit({
                          kind: "duplicate-page",
                          slug: page.slug,
                          newSlug: slug,
                          title: page.title + " Copy",
                        }).catch(() => {});
                    }}
                  >
                    Duplicate page
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={busy}
                    onClick={() => {
                      const title = window.prompt("Page title", page.title);
                      if (title)
                        void edit({
                          kind: "rename-page",
                          slug: page.slug,
                          title,
                        }).catch(() => {});
                    }}
                  >
                    Rename page
                  </button>
                  <button
                    className="btn sm ghost"
                    disabled={busy || page.slug === "home"}
                    onClick={() =>
                      void edit({
                        kind: "set-navigation",
                        slug: page.slug,
                        visible: page.navHidden,
                      }).catch(() => {})
                    }
                  >
                    {page.navHidden
                      ? "Show in navigation"
                      : "Hide from navigation"}
                  </button>
                  <button
                    className="btn sm ghost"
                    onClick={() => setShowAssets(!showAssets)}
                  >
                    {showAssets ? "Close assets" : "Open photo library"}
                  </button>
                </div>
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void edit({
                      kind: "page-seo",
                      slug: page.slug,
                      title: metaTitle || page.seoTitle || page.title,
                      description:
                        metaDescription ||
                        page.seoDescription ||
                        spec.seo.description,
                    }).catch(() => {});
                  }}
                >
                  <label>
                    SEO title
                    <input
                      maxLength={70}
                      value={metaTitle}
                      onChange={(e) => setMetaTitle(e.target.value)}
                      placeholder={page.seoTitle || page.title}
                    />
                  </label>
                  <label>
                    SEO description
                    <input
                      maxLength={180}
                      value={metaDescription}
                      onChange={(e) => setMetaDescription(e.target.value)}
                      placeholder={page.seoDescription || spec.seo.description}
                    />
                  </label>
                  <button className="btn sm" disabled={busy}>
                    Save page SEO
                  </button>
                </form>
                {showAssets && (
                  <MediaLibraryPanel
                    siteId={id}
                    onUpdated={() => assets.reload()}
                  />
                )}
                <p className="muted">
                  Up to seven complete pages. Select a section to edit; drag to
                  reorder. Use Puck's undo/redo, then Save draft.
                </p>
              </section>
              {preview ? (
                <iframe
                  title={`Saved website preview: ${page.title}`}
                  src={`/api/sites/${id}/versions/${current}/preview/${page.slug === "home" ? "" : `${page.slug}/`}`}
                  style={{
                    width: "100%",
                    height: "75vh",
                    border: "1px solid #ddd",
                    background: "white",
                  }}
                />
              ) : (
                <Puck
                  key={`${current}:${page.slug}`}
                  config={config}
                  data={puckData}
                  onChange={() => setDirty(true)}
                  onPublish={async (data) => {
                    await edit({
                      kind: "replace-page-sections",
                      slug: page.slug,
                      sections: fromPuck(
                        data,
                        assets.data?.photos ?? [],
                        (spec.pages ?? []).flatMap((pg: J) =>
                          (pg.sections ?? []).flatMap((sec: J) => [
                            ...(sec.media ? [sec.media] : []),
                            ...(sec.items ?? []).flatMap((it: J) =>
                              it.media ? [it.media] : [],
                            ),
                          ]),
                        ),
                      ),
                    });
                  }}
                  dictionary={{ "header-publish": "Save draft" }}
                  viewports={[
                    { width: 390, height: 844, label: "Mobile" },
                    { width: 768, height: 1024, label: "Tablet" },
                    { width: 1440, height: 900, label: "Desktop" },
                  ]}
                />
              )}
            </>
          )
        }
      </Async>
    </div>
  );
}
