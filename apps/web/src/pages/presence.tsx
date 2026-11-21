import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, when, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";
import { BrandOsPanel, CampaignAskPanel, CreativeSetPanel } from "./brand-os";
import { MediaLibraryPanel } from "./media-library";

const KIND: Record<string, "ok" | "warn" | "bad" | "wait"> = {
  OK: "ok",
  WARN: "warn",
  FAIL: "bad",
  UNKNOWN: "wait",
};
const WORD: Record<string, string> = {
  OK: "Good",
  WARN: "Could be better",
  FAIL: "Needs attention",
  UNKNOWN: "Not connected",
};
const CAN: Record<string, string> = {
  yes: "Krevstudio can fix this for you.",
  with_approval: "Krevstudio can fix this once you approve.",
  no: "This needs you.",
};

/** /app/presence: the owner's first website is their business presence until multi-site is surfaced. */
export function PresenceEntry() {
  const sites = useLoad(() => api<J[]>("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) =>
        rows.length ? (
          <Navigate to={`/app/sites/${rows[0].id}/presence`} replace />
        ) : (
          <Empty title="No business profile yet">
            Presence starts with a website. Create one and Krevstudio will read
            your details from it.
            <p>
              <Link className="btn" to="/app/sites/new">
                Create my website
              </Link>
            </p>
          </Empty>
        )
      }
    </Async>
  );
}

const hoursToText = (h: J[]) =>
  h.map((r) => `${r.days} | ${r.hours}`).join("\n");
const textToHours = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [days, ...rest] = l.split("|");
      return { days: (days ?? "").trim(), hours: rest.join("|").trim() };
    })
    .filter((r) => r.days && r.hours);
const lines = (t: string) =>
  t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const opt = (v: string) => (v.trim() ? v.trim() : undefined);

function CheckItem({ c }: { c: J }) {
  return (
    <li className="k-check">
      <div className="row between">
        <strong>{c.observed}</strong>
        <Status kind={KIND[c.status] ?? "wait"}>{WORD[c.status]}</Status>
      </div>
      {c.status !== "OK" && (
        <>
          <p className="muted">{c.why}</p>
          {c.fix && (
            <p>
              <strong>What to do:</strong> {c.fix}
            </p>
          )}
          <p className="muted">
            {CAN[c.koraCanFix]}
            {c.authorization ? ` ${c.authorization}` : ""}
          </p>
        </>
      )}
    </li>
  );
}

function ProfileForm({
  id,
  profile,
  onSaved,
}: {
  id: string;
  profile: J;
  onSaved: () => void;
}) {
  const f = profile.facts;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const g = (k: string) => String(d.get(k) ?? "");
    const facts = {
      identity: {
        ...f.identity,
        name: g("name"),
        description: g("description"),
        industry: g("industry"),
      },
      contact: {
        ...(opt(g("phone")) ? { phone: opt(g("phone")) } : {}),
        ...(opt(g("whatsapp")) ? { whatsapp: opt(g("whatsapp")) } : {}),
        ...(opt(g("email")) ? { email: opt(g("email")) } : {}),
        ...(opt(g("address")) ? { address: opt(g("address")) } : {}),
        ...(opt(g("city")) ? { city: opt(g("city")) } : {}),
      },
      availability: {
        hours: textToHours(g("hours")),
        ...(opt(g("notice")) ? { notice: opt(g("notice")) } : {}),
      },
      offer: { services: lines(g("services")), offers: f.offer.offers },
      social: f.social,
    };
    setBusy(true);
    setMsg(null);
    try {
      await api("PUT", `/api/sites/${id}/presence/profile`, {
        facts,
        expectedRevision: profile.revision,
      });
      setMsg({ ok: true, text: "Saved." });
      onSaved();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="card stack"
      onSubmit={submit}
      aria-label="Business details"
    >
      <h2>Your business details</h2>
      <p className="muted">
        Krevstudio uses only what you write here for your website, posts and
        replies. Nothing is guessed.
      </p>
      <label>
        Business name
        <input
          name="name"
          defaultValue={f.identity.name}
          required
          maxLength={100}
        />
      </label>
      <label>
        What you do
        <textarea
          name="description"
          rows={3}
          defaultValue={f.identity.description}
          maxLength={600}
        />
      </label>
      <label>
        Type of business
        <input
          name="industry"
          defaultValue={f.identity.industry}
          maxLength={80}
        />
      </label>
      <label>
        Phone
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={f.contact.phone ?? ""}
        />
      </label>
      <label>
        WhatsApp number
        <input
          name="whatsapp"
          type="tel"
          inputMode="tel"
          defaultValue={f.contact.whatsapp ?? ""}
        />
        <span className="field-hint">
          Digits only, with country code, for example +2348012345678.
        </span>
      </label>
      <label>
        Email
        <input name="email" type="email" defaultValue={f.contact.email ?? ""} />
      </label>
      <label>
        Address
        <input
          name="address"
          defaultValue={f.contact.address ?? ""}
          maxLength={200}
        />
      </label>
      <label>
        City
        <input name="city" defaultValue={f.contact.city ?? ""} maxLength={80} />
      </label>
      <label>
        Opening hours
        <textarea
          name="hours"
          rows={3}
          defaultValue={hoursToText(f.availability.hours)}
        />
        <span className="field-hint">
          One line each, like: Mon-Sat | 9am-8pm
        </span>
      </label>
      <label>
        Closure or holiday notice
        <input
          name="notice"
          defaultValue={f.availability.notice ?? ""}
          maxLength={200}
        />
      </label>
      <label>
        What you sell
        <textarea
          name="services"
          rows={4}
          defaultValue={f.offer.services.join("\n")}
        />
        <span className="field-hint">One per line.</span>
      </label>
      {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
      <div className="row">
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}

export function PresencePage() {
  const { id } = useParams();
  const view = useLoad(() => api<J>("GET", `/api/sites/${id}/presence`), [id]);
  const draftSite = useLoad(() => api<J>("GET", `/api/sites/${id}`), [id]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setMsg(null), [id]);
  const act = async (label: string, run: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      await run();
      setMsg({ ok: true, text: label });
      view.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  const startWithoutWebsite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const industry = String(form.get("industry") ?? "").trim();
    if (!name || !industry) return;
    await act("Your business facts were saved without creating a website.", () =>
      api("PUT", `/api/sites/${id}/presence/profile`, {
        expectedRevision: 0,
        facts: {
          identity: { name, description, industry },
          contact: {},
          availability: { hours: [] },
          offer: { services: [], offers: [] },
          social: [],
        },
      }),
    );
  };
  return (
    <Async state={view}>
      {(v) =>
        !v.profile ? (
          <div className="stack">
            <section className="card stack">
              <h2>Tell Krevstudio about your business</h2>
              <p className="muted">
                Start with a short factual brief. You do not need to create or publish a website to make a logo, graphic or video.
              </p>
              <form className="stack" onSubmit={startWithoutWebsite} aria-label="Start business profile">
                <label>Business name
                  <input name="name" defaultValue={draftSite.data?.name ?? ""} required maxLength={100} />
                </label>
                <label>Industry
                  <input name="industry" required maxLength={80} placeholder="e.g. Bakery" />
                </label>
                <label>What your business does
                  <textarea name="description" maxLength={600} rows={3} placeholder="Describe only what you actually offer" />
                </label>
                <button className="btn" disabled={busy}>Save business brief</button>
              </form>
              {v.importable && (
                <button className="btn ghost" disabled={busy} onClick={() =>
                  act("Details read from your existing website.", () =>
                    api("POST", `/api/sites/${id}/presence/import`),
                  )
                }>Import details from an existing website</button>
              )}
              {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
            </section>
          </div>
        ) : (
          <div className="stack">
            <section className="card stack" aria-labelledby="presence-h">
              <p className="k-overline">Presence health</p>
              <h2 id="presence-h">{v.health.headline}</h2>
              <p className="muted">
                {v.health.counts.OK} good · {v.health.counts.WARN} could be
                better · {v.health.counts.FAIL} need attention ·{" "}
                {v.health.counts.UNKNOWN} not connected yet
              </p>
              <div className="row">
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    act("Checked just now.", () =>
                      api("POST", `/api/sites/${id}/presence/check`),
                    )
                  }
                >
                  Check again
                </button>
                <button
                  className="btn sm ghost"
                  disabled={busy}
                  onClick={() =>
                    act(
                      "A new draft was created. Review it in Build, then publish.",
                      () => api("POST", `/api/sites/${id}/presence/apply`),
                    )
                  }
                >
                  Update my website with these details
                </button>
              </div>
              {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
            </section>

            {v.health.attention.length > 0 && (
              <section aria-labelledby="needs-you">
                <h2 id="needs-you">Needs you</h2>
                <ul className="k-checks">
                  {v.health.attention.map((c: J) => (
                    <CheckItem key={c.id} c={c} />
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="all-checks">
              <h2 id="all-checks">Everything Krevstudio checked</h2>
              <ul className="k-checks">
                {v.health.checks
                  .filter((c: J) => c.status === "OK" || c.status === "UNKNOWN")
                  .map((c: J) => (
                    <CheckItem key={c.id} c={c} />
                  ))}
              </ul>
            </section>
            <ProfileForm id={id!} profile={v.profile} onSaved={view.reload} />
            <p className="muted">
              Details last saved {when(v.profile.updatedAt)}. Revision{" "}
              {v.profile.revision}.
            </p>
          </div>
        )
      }
    </Async>
  );
}

const TONES = ["warm", "professional", "playful", "premium", "direct"];
export function BrandPage() {
  const { id } = useParams();
  const brand = useLoad(
    () => api<J>("GET", `/api/sites/${id}/brand-kit`),
    [id],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (body: unknown, text: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", `/api/sites/${id}/brand-kit`, body);
      setMsg({ ok: true, text });
      brand.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Async state={brand}>
      {(b) => {
        const cur = b.current;
        const kit = cur?.kit ?? b.suggestion;
        if (!kit)
          return (
            <section className="card stack">
              <h2>Start with your own brand preferences</h2>
              <p className="muted">
                Choose an editable starter identity for this business without
                first making a website. These are suggestions, not confirmed
                facts or a final approved brand.
              </p>
              <label>
                Visual personality
                <select id="starter-voice" defaultValue="warm">
                  <option value="warm">Warm and approachable</option>
                  <option value="professional">Professional</option>
                  <option value="premium">Premium</option>
                  <option value="playful">Playful</option>
                  <option value="direct">Direct</option>
                </select>
              </label>
              <button className="btn" disabled={busy} onClick={() => {
                const el = document.getElementById("starter-voice") as HTMLSelectElement | null;
                const voice = el?.value ?? "warm";
                void save({ kit: {
                  logoAssetId: null,
                  colors: {
                    ink: "#17242a", canvas: "#fffdf8",
                    primary: "#17242a", primaryText: "#fffdf8",
                    accent: "#873f34", accentText: "#ffffff", muted: "#46545b",
                  },
                  typography: { pairing: "starter", displayFamily: "Georgia", bodyFamily: "system-ui" },
                  shape: "soft",
                  voice: { tone: voice, use: [], avoid: [], language: "en" },
                  imagery: { style: "minimal", seed: 1 },
                } }, "Starter Brand Kit saved as an editable owner-approved version.");
              }}>
                Create editable Brand Kit
              </button>
              {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
            </section>
          );
        const onSubmit = (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const words = (k: string) =>
            String(d.get(k) ?? "")
              .split(",")
              .map((w) => w.trim())
              .filter(Boolean);
          void save(
            {
              kit: {
                ...kit,
                voice: {
                  ...kit.voice,
                  tone: String(d.get("tone")),
                  use: words("use"),
                  avoid: words("avoid"),
                },
              },
            },
            "Saved as a new version. Earlier posts keep the version they used.",
          );
        };
        return (
          <div className="stack">
            <BrandOsPanel siteId={String(id)} />
            <MediaLibraryPanel siteId={String(id)} />
            <CampaignAskPanel siteId={String(id)} />
            <CreativeSetPanel siteId={String(id)} />
            <section className="card stack" aria-labelledby="brand-h">
              <p className="k-overline">
                {cur
                  ? `Brand Kit · version ${cur.version}`
                  : "Suggested from your website"}
              </p>
              <h2 id="brand-h">How your business looks and sounds</h2>
              <ul className="k-swatches" aria-label="Colors">
                {Object.entries(kit.colors).map(([k, hex]) => (
                  <li key={k}>
                    <span
                      className="k-swatch"
                      style={{ background: String(hex) }}
                      role="img"
                      aria-label={`${k} ${String(hex)}`}
                    />
                    <span className="muted">{k}</span>
                    <code>{String(hex)}</code>
                  </li>
                ))}
              </ul>
              <p>
                Fonts: <strong>{kit.typography.displayFamily}</strong> for
                headings, <strong>{kit.typography.bodyFamily}</strong> for text.
              </p>
              {!cur && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => save({ from: "site" }, "Brand Kit created.")}
                >
                  Use this Brand Kit
                </button>
              )}
              {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
            </section>
            {cur && (
              <form
                className="card stack"
                onSubmit={onSubmit}
                aria-label="Voice"
              >
                <h2>Voice</h2>
                <label>
                  Tone
                  <select name="tone" defaultValue={kit.voice.tone}>
                    {TONES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Words to use
                  <input name="use" defaultValue={kit.voice.use.join(", ")} />
                  <span className="field-hint">Separate with commas.</span>
                </label>
                <label>
                  Words to avoid
                  <input
                    name="avoid"
                    defaultValue={kit.voice.avoid.join(", ")}
                  />
                </label>
                <div className="row">
                  <button className="btn" disabled={busy}>
                    Save new version
                  </button>
                </div>
              </form>
            )}
            {b.versions.length > 1 && (
              <section aria-labelledby="hist">
                <h2 id="hist">Earlier versions</h2>
                <ul className="k-checks">
                  {b.versions.map((v: J) => (
                    <li key={v.id} className="k-check row between">
                      <span>
                        Version {v.version} ·{" "}
                        {v.origin === "DERIVED"
                          ? "from your website"
                          : "edited by you"}
                      </span>
                      <span className="muted">{when(v.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        );
      }}
    </Async>
  );
}
