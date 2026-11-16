/**
 * Website Studio: Puck edits SiteSpec pages, but does not replace the
 * authoritative SiteSpec renderer or immutable version store.
 * The toolbar's Save Draft button goes through Kora's existing protected
 * /edit endpoint. Site publishing remains a separate owner action.
 */
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Puck, type Config, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { api, type J } from "../api";
import { Async, Notice, errText, useLoad } from "../ui";

type EditProps = {
  id?: string;
  original: string;
  heading: string;
  subheading: string;
  body: string;
  imageUrl: string;
  buttonLabel: string;
};
type ComponentName = "Hero" | "Statement" | "Offer" | "Products" | "Story" | "Contact" | "CTA" | "Existing";
type Components = Record<ComponentName, EditProps>;
const names: Record<string, ComponentName> = {
  hero: "Hero", statement: "Statement", offer: "Offer",
  products: "Products", story: "Story", contact: "Contact",
  cta: "CTA",
};
const headingFields = {
  heading: { type: "text" as const, label: "Headline" },
  subheading: { type: "textarea" as const, label: "Supporting text" },
  imageUrl: { type: "text" as const, label: "Approved image URL" },
};
const blockRender = (p: EditProps) => (
  <section style={{ padding: "clamp(32px,6vw,92px) 5vw", margin: "12px", background: "#fffaf2", color: "#171319" }}>
    {p.imageUrl ? <img src={p.imageUrl} alt="" style={{ width: "100%", maxHeight: 340, objectFit: "cover", marginBottom: 24 }} /> : null}
    <h2 style={{ fontSize: "clamp(2rem,5vw,4.5rem)", lineHeight: 1.08 }}>{p.heading}</h2>
    {p.subheading ? <p style={{ fontSize: "1.1rem" }}>{p.subheading}</p> : null}
    {p.body ? <p>{p.body}</p> : null}
    {p.buttonLabel ? <span style={{ display: "inline-block", padding: "12px 20px", background: "#171319", color: "white" }}>{p.buttonLabel}</span> : null}
  </section>
);
function defaultSection(type: ComponentName): J {
  if (type === "Hero") return { type: "hero", layout: "type-dominant", heading: "New headline", subheading: "", highlights: [], variant: 0 };
  if (type === "Statement") return { type: "statement", layout: "large", text: "Introduce this part of your business." };
  if (type === "Story") return { type: "story", layout: "craft", heading: "Our story", body: ["Tell customers about the business."], values: [] };
  if (type === "Contact") return { type: "contact", layout: "enquiry-form", heading: "Contact", intro: "", form: false, formFields: ["name", "email", "message"], submitLabel: "Send message" };
  if (type === "CTA") return { type: "cta", layout: "outline", heading: "Get in touch", body: "", button: { label: "Contact us", href: "/" } };
  throw new Error("New sections of this type require business content first.");
}
function dataProps(section: J, id: string): EditProps {
  return {
    id,
    original: JSON.stringify(section),
    heading: section.heading ?? (section.type === "statement" ? section.text : section.type),
    subheading: section.subheading ?? section.intro ?? "",
    body: section.type === "story" ? (section.body ?? []).join("\n") : section.body ?? "",
    imageUrl: section.media?.url ?? "",
    buttonLabel: section.button?.label ?? "",
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
function fromPuck(data: Data): J[] {
  return data.content.map((component) => {
    const p = component.props as unknown as EditProps;
    if (!p.original) throw new Error("A new section needs a supported source template.");
    const section: J = JSON.parse(p.original);
    if ((names[section.type] ?? "Existing") !== component.type)
      throw new Error("Unsupported section conversion.");
    switch (section.type) {
      case "hero":
        section.heading = p.heading;
        section.subheading = p.subheading;
        break;
      case "statement":
        section.text = p.heading;
        break;
      case "offer":
      case "products":
        section.heading = p.heading;
        section.intro = p.subheading;
        break;
      case "story":
        section.heading = p.heading;
        section.body = p.body.split("\n").map((s) => s.trim()).filter(Boolean);
        break;
      case "contact":
        section.heading = p.heading;
        section.intro = p.subheading;
        break;
      case "cta":
        section.heading = p.heading;
        section.body = p.body;
        section.button.label = p.buttonLabel;
        break;
    }
    if (section.media && p.imageUrl) section.media.url = p.imageUrl;
    return section;
  });
}
const defaults = (type: ComponentName) => {
  try { return dataProps(defaultSection(type), ""); }
  catch { return dataProps({ type: "statement", layout: "large", text: "Existing section" }, ""); }
};
const websiteConfig: Config<Components> = {
  components: {
    Hero: { label: "Hero", fields: headingFields, defaultProps: defaults("Hero"), render: blockRender },
    Statement: { label: "Statement", fields: { heading: { type: "textarea" } }, defaultProps: defaults("Statement"), render: blockRender },
    Offer: { label: "Services", fields: { heading: { type: "text" }, subheading: { type: "textarea" } }, defaultProps: defaults("Offer"), render: blockRender, permissions: { insert: false } },
    Products: { label: "Products", fields: { heading: { type: "text" }, subheading: { type: "textarea" } }, defaultProps: defaults("Products"), render: blockRender, permissions: { insert: false } },
    Story: { label: "Story", fields: { heading: { type: "text" }, body: { type: "textarea" }, imageUrl: { type: "text" } }, defaultProps: defaults("Story"), render: blockRender },
    Contact: { label: "Contact", fields: { heading: { type: "text" }, subheading: { type: "textarea" } }, defaultProps: defaults("Contact"), render: blockRender },
    CTA: { label: "Call to action", fields: { heading: { type: "text" }, body: { type: "textarea" }, buttonLabel: { type: "text" } }, defaultProps: defaults("CTA"), render: blockRender },
    Existing: { label: "Existing section", fields: {}, defaultProps: defaults("Existing"), render: blockRender, permissions: { insert: false } },
  },
};
export function WebsiteStudio() {
  const { id } = useParams();
  const versions = useLoad(() => api<J[]>("GET", `/api/sites/${id}/versions`), [id]);
  const site = useLoad(() => api<J>("GET", `/api/sites/${id}`), [id]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const current = selectedVersion ?? site.data?.currentVersionId ?? versions.data?.[0]?.id;
  const detail = useLoad(
    () => current ? api<J>("GET", `/api/sites/${id}/versions/${current}`) : Promise.resolve(null),
    [id, current],
  );
  const spec = detail.data?.spec;
  const [selectedPage, setSelectedPage] = useState("home");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [preview, setPreview] = useState(false);
  const page = spec?.pages?.find((p: J) => p.slug === selectedPage) ?? spec?.pages?.[0];
  const puckData = useMemo(() => page ? toPuck(page) : null, [page]);
  async function edit(designEdit: J) {
    if (!current) throw new Error("Select an existing draft.");
    setBusy(true); setError(""); setSaved("");
    try {
      const result = await api<J>("POST", `/api/sites/${id}/edit`, { baseVersionId: current, designEdit });
      setSelectedVersion(result.version.id);
      setSaved(`Draft saved as version ${result.version.number}.`);
      versions.reload(); site.reload();
    } catch (e) {
      setError(errText(e));
      throw e;
    } finally { setBusy(false); }
  }
  async function createPage(e: FormEvent) {
    e.preventDefault();
    if (!spec || !newTitle.trim()) return;
    const slug = newTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const hero = spec.pages[0]?.sections.find((s: J) => s.type === "hero");
    const contact = spec.pages[0]?.sections.find((s: J) => s.type === "contact");
    if (!hero || !slug) { setError("The site requires a homepage before adding pages."); return; }
    try {
      await edit({ kind: "create-page", slug, title: newTitle.trim(), purpose: "about", sections: [
        { ...hero, heading: newTitle.trim(), subheading: "" },
        ...(contact ? [contact] : []),
      ] });
      setSelectedPage(slug);
      setNewTitle("");
    } catch { /* The API error is displayed above. */ }
  }
  if (!id) return <Notice kind="bad">Website ID is missing.</Notice>;
  return (
    <div className="stack">
      <header className="card row between">
        <div>
          <p className="k-overline">Kora Website Studio</p>
          <h1>Visual website editor</h1>
          <p className="muted">Edits create a new draft; your published site stays unchanged until approved.</p>
        </div>
        <Link className="btn ghost" to={`/app/sites/${id}/build`}>Versions &amp; publish</Link>
      </header>
      {error && <Notice kind="bad">{error}</Notice>}
      {saved && <Notice kind="ok">{saved}</Notice>}
      <Async state={detail}>
        {() => !spec || spec.version !== 3 || !page || !puckData ? (
          <Notice kind="warn">Generate or upgrade to a SiteSpec v3 draft to use the visual editor.</Notice>
        ) : (
          <>
            <section className="card stack">
              <div className="row" role="group" aria-label="Pages">
                {spec.pages.map((p: J) => (
                  <button key={p.slug} className="btn sm ghost" aria-pressed={p.slug === page.slug} onClick={() => setSelectedPage(p.slug)}>{p.nav || p.title}</button>
                ))}
              </div>
              <form className="row" onSubmit={(e) => void createPage(e)}>
                <label>New page title <input value={newTitle} maxLength={80} onChange={(e) => setNewTitle(e.target.value)} /></label>
                <button className="btn sm" disabled={busy || spec.pages.length >= 7 || !newTitle.trim()}>Add page</button>
                <button type="button" className="btn sm ghost" disabled={busy || page.slug === "home"} onClick={() => {
                  if (window.confirm(`Delete page "${page.title}"?`)) void edit({kind:"delete-page",slug:page.slug}).then(() => setSelectedPage("home")).catch(()=>{});
                }}>Delete this page</button>
                <button type="button" className="btn sm quiet" onClick={() => setPreview(!preview)}>{preview ? "Editor" : "Actual saved preview"}</button>
              </form>
              <p className="muted">Up to seven complete pages. Select a section to edit; drag to reorder. Use Puck's undo/redo, then Save draft.</p>
            </section>
            {preview ? (
              <iframe
                title={`Saved website preview: ${page.title}`}
                src={`/api/sites/${id}/versions/${current}/preview/${page.slug === "home" ? "" : `${page.slug}/`}`}
                style={{width:"100%",height:"75vh",border:"1px solid #ddd",background:"white"}}
              />
            ) : (
              <Puck
                key={`${current}:${page.slug}`}
                config={websiteConfig}
                data={puckData}
                onPublish={async (data) => {
                  await edit({ kind: "replace-page-sections", slug: page.slug, sections: fromPuck(data) });
                }}
                dictionary={{ "header-publish": "Save draft" }}
                viewports={[{ width: 390, height: 844, label: "Mobile" }, { width: 768, height: 1024, label: "Tablet" }, { width: 1440, height: 900, label: "Desktop" }]}
              />
            )}
          </>
        )}
      </Async>
    </div>
  );
}
