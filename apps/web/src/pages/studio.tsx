import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, when, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";

export function MarketingEntry() {
  const sites = useLoad(() => api<J[]>("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) =>
        rows.length ? (
          <Navigate to={`/app/sites/${rows[0].id}/create`} replace />
        ) : (
          <Empty title="Nothing to market yet">
            Create your website first, then Kora can help you promote it.
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

const TABS = [
  ["write", "Write"],
  ["images", "Images"],
  ["video", "Video"],
] as const;

export function StudioPage() {
  const { id } = useParams();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("write");
  const presence = useLoad(
    () => api<J>("GET", `/api/sites/${id}/presence`),
    [id],
  );
  const kit = useLoad(() => api<J>("GET", `/api/sites/${id}/brand-kit`), [id]);
  const opts = useLoad(
    () => api<J>("GET", `/api/sites/${id}/studio/options`),
    [id],
  );
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Create</p>
        <h2>Posts, images and video in your brand</h2>
        <p className="muted">
          Everything is made from your business details and Brand Kit. Kora
          never invents a price, time or phone number.
        </p>
        <div className="chips" role="tablist" aria-label="What to make">
          {TABS.map(([v, t]) => (
            <button
              key={v}
              role="tab"
              className="chip"
              aria-selected={tab === v}
              aria-pressed={tab === v}
              onClick={() => setTab(v)}
            >
              {t}
            </button>
          ))}
        </div>
      </section>
      <Async state={presence}>
        {(p) =>
          !p.profile ? (
            <Empty title="Add your business details first">
              Kora writes only from facts you have confirmed.
              <p>
                <Link className="btn" to={`/app/sites/${id}/presence`}>
                  Go to Presence
                </Link>
              </p>
            </Empty>
          ) : (
            <Async state={kit}>
              {(k) =>
                !k.current ? (
                  <Empty title="Create your Brand Kit first">
                    Colors, fonts and tone come from it, so everything you make
                    looks like you.
                    <p>
                      <Link className="btn" to={`/app/sites/${id}/brand`}>
                        Go to Brand
                      </Link>
                    </p>
                  </Empty>
                ) : (
                  <Async state={opts}>
                    {(o) =>
                      tab === "write" ? (
                        <WriteTab id={id!} facts={p.profile.facts} o={o} />
                      ) : tab === "images" ? (
                        <ImagesTab id={id!} facts={p.profile.facts} o={o} />
                      ) : (
                        <VideoTab id={id!} facts={p.profile.facts} o={o} />
                      )
                    }
                  </Async>
                )
              }
            </Async>
          )
        }
      </Async>
    </div>
  );
}

const GOAL: Record<string, string> = {
  promote_service: "Promote a service",
  announce_offer: "Announce an offer",
  hours_notice: "Opening hours or notice",
  welcome: "Introduce the business",
  reminder: "Remind people you are open",
};
const CHAN: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp message",
  tiktok: "TikTok caption",
  google_business: "Google Business post",
};

function WriteTab({ id, facts, o }: { id: string; facts: J; o: J }) {
  const drafts = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/content/drafts`),
    [id],
  );
  const [goal, setGoal] = useState("welcome");
  const [channel, setChannel] = useState("instagram");
  const [pick, setPick] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const offers = facts.offer.offers as J[];
  const services = facts.offer.services as string[];
  const gen = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", `/api/sites/${id}/content/drafts`, {
        goal,
        channel,
        ...(goal === "announce_offer" ? { offerId: pick } : {}),
        ...(goal === "promote_service" ? { service: pick } : {}),
      });
      drafts.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <form className="card stack" onSubmit={gen} aria-label="Write a post">
        <label>
          What is it for?
          <select
            value={goal}
            onChange={(e) => {
              setGoal(e.target.value);
              setPick("");
            }}
          >
            {o.content.goals.map((g: string) => (
              <option key={g} value={g}>
                {GOAL[g] ?? g}
              </option>
            ))}
          </select>
        </label>
        <label>
          Where will it go?
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {o.content.channels.map((c: string) => (
              <option key={c} value={c}>
                {CHAN[c] ?? c}
              </option>
            ))}
          </select>
        </label>
        {goal === "announce_offer" && (
          <label>
            Which offer?
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {offers.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
            {!offers.length && (
              <span className="field-hint">
                You have no offers yet. Add them in Presence.
              </span>
            )}
          </label>
        )}
        {goal === "promote_service" && (
          <label>
            Which service?
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              required
            >
              <option value="">Choose…</option>
              {services.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        )}
        {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
        <div className="row">
          <button className="btn" disabled={busy}>
            {busy ? "Writing…" : "Write options"}
          </button>
        </div>
      </form>
      <Async state={drafts}>
        {(rows) =>
          rows.length === 0 ? null : (
            <ul className="k-checks">
              {rows.map((d) => (
                <DraftCard key={d.id} id={id} d={d} reload={drafts.reload} />
              ))}
            </ul>
          )
        }
      </Async>
    </div>
  );
}

function DraftCard({
  id,
  d,
  reload,
}: {
  id: string;
  d: J;
  reload: () => void;
}) {
  const [text, setText] = useState<string>(d.draft.body);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const save = async () => {
    try {
      await api("PATCH", `/api/sites/${id}/content/drafts/${d.id}`, {
        ...d.draft,
        body: text,
      });
      setMsg({ ok: true, text: "Saved." });
      reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    }
  };
  return (
    <li className="k-check stack">
      <div className="row between">
        <strong>{d.draft.headline}</strong>
        <span className="muted">
          {CHAN[d.channel]} ·{" "}
          {d.source === "model"
            ? "AI draft"
            : d.source === "owner"
              ? "Edited by you"
              : "From your details"}
        </span>
      </div>
      <label>
        Post text
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {d.draft.hashtags.length > 0 && (
        <p className="muted">{d.draft.hashtags.join(" ")}</p>
      )}
      {d.issues.map((i: J) => (
        <Notice key={i.message} kind={i.severity === "block" ? "bad" : "warn"}>
          {i.message}
        </Notice>
      ))}
      {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
      <div className="row">
        <button className="btn sm" onClick={save}>
          Save changes
        </button>
        <button
          className="btn sm ghost"
          onClick={() => void navigator.clipboard?.writeText(text)}
        >
          Copy
        </button>
        <button
          className="btn sm quiet"
          onClick={async () => {
            await api("DELETE", `/api/sites/${id}/content/drafts/${d.id}`);
            reload();
          }}
        >
          Discard
        </button>
      </div>
    </li>
  );
}

const svgUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const FORMAT_LABEL = (f: J) => `${f.label} (${f.width}×${f.height})`;

function ImagesTab({ id, facts, o }: { id: string; facts: J; o: J }) {
  const assets = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/assets`),
    [id],
  );
  const contact = facts.contact.whatsapp ?? facts.contact.phone ?? "";
  const [spec, setSpec] = useState({
    format: "square",
    category: "announcement",
    layout: "bold",
    colorway: "primary",
    headline: facts.identity.name,
    subline: "",
    detail: "",
    cta: "",
    showContact: true,
    contact,
  });
  const set = (k: string, v: string | boolean) =>
    setSpec((s) => ({ ...s, [k]: v }));
  const [preview, setPreview] = useState<{ svg: string; issues: J[] } | null>(
    null,
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useMemo(() => JSON.stringify(spec), [spec]);
  useEffect(() => {
    const t = setTimeout(() => {
      api<J>("POST", `/api/sites/${id}/assets/preview`, spec).then(
        (r) => setPreview({ svg: r.svg, issues: r.issues }),
        (e) => setMsg({ ok: false, text: errText(e) }),
      );
    }, 300);
    return () => clearTimeout(t);
  }, [key]);
  const blocked = preview?.issues.some((i) => i.severity === "block");
  return (
    <div className="stack">
      <div className="k-studio">
        <form
          className="card stack"
          aria-label="Design an image"
          onSubmit={async (e) => {
            e.preventDefault();
            setMsg(null);
            try {
              await api("POST", `/api/sites/${id}/assets`, spec);
              setMsg({ ok: true, text: "Saved to your library below." });
              assets.reload();
            } catch (x) {
              setMsg({ ok: false, text: errText(x) });
            }
          }}
        >
          <label>
            Size
            <select
              value={spec.format}
              onChange={(e) => set("format", e.target.value)}
            >
              {o.assets.formats.map((f: J) => (
                <option key={f.id} value={f.id}>
                  {FORMAT_LABEL(f)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Style
            <select
              value={spec.layout}
              onChange={(e) => set("layout", e.target.value)}
            >
              {o.assets.layouts.map((l: string) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Color
            <select
              value={spec.colorway}
              onChange={(e) => set("colorway", e.target.value)}
            >
              {o.assets.colorways.map((l: string) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label>
            Headline
            <input
              value={spec.headline}
              maxLength={60}
              required
              onChange={(e) => set("headline", e.target.value)}
            />
          </label>
          <label>
            Short line
            <input
              value={spec.subline}
              maxLength={140}
              onChange={(e) => set("subline", e.target.value)}
            />
          </label>
          <label>
            Highlight (for example a price)
            <input
              value={spec.detail}
              maxLength={80}
              onChange={(e) => set("detail", e.target.value)}
            />
          </label>
          <label>
            Button text
            <input
              value={spec.cta}
              maxLength={28}
              onChange={(e) => set("cta", e.target.value)}
            />
          </label>
          <label>
            Contact line
            <input
              value={spec.contact}
              maxLength={60}
              onChange={(e) => set("contact", e.target.value)}
            />
          </label>
          {preview?.issues.map((i) => (
            <Notice
              key={i.message}
              kind={i.severity === "block" ? "bad" : "warn"}
            >
              {i.message}
            </Notice>
          ))}
          {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
          <div className="row">
            <button className="btn" disabled={Boolean(blocked)}>
              Save image
            </button>
          </div>
        </form>
        <div className="card k-preview" aria-live="polite">
          {preview ? (
            <img alt={`Preview: ${spec.headline}`} src={svgUrl(preview.svg)} />
          ) : (
            <p className="muted">Preparing preview…</p>
          )}
        </div>
      </div>
      <Async state={assets}>
        {(rows) => (
          <ul className="k-gallery">
            {rows.map((a) => (
              <li key={a.id} className="k-check">
                {a.kind === "VIDEO" ? (
                  <video
                    controls
                    preload="metadata"
                    src={`/api/sites/${id}/assets/${a.id}/file`}
                  />
                ) : (
                  <img
                    alt={`${a.spec.headline}`}
                    loading="lazy"
                    src={`/api/sites/${id}/assets/${a.id}/file`}
                  />
                )}
                <p className="muted">
                  {a.format} · Brand v{a.brandVersion} · {when(a.createdAt)}
                </p>
                <div className="row">
                  <a
                    className="btn sm ghost"
                    href={`/api/sites/${id}/assets/${a.id}/file?as=download`}
                    download
                  >
                    Download
                  </a>
                  {a.kind === "IMAGE" && (
                    <a
                      className="btn sm quiet"
                      href={`/api/sites/${id}/assets/${a.id}/file?as=svg`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      SVG
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  );
}

const JOB: Record<
  string,
  { kind: "ok" | "warn" | "bad" | "info" | "wait"; text: string }
> = {
  QUEUED: { kind: "wait", text: "Waiting" },
  RENDERING: { kind: "info", text: "Making your video" },
  READY: { kind: "ok", text: "Ready" },
  FAILED: { kind: "bad", text: "Did not work" },
};

function VideoTab({ id, facts, o }: { id: string; facts: J; o: J }) {
  const jobs = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/motion`),
    [id],
    3000,
  );
  const contact = facts.contact.whatsapp ?? facts.contact.phone ?? "";
  const [spec, setSpec] = useState({
    template: "service_stack",
    format: "story",
    colorway: "primary",
    headline: "What we do",
    subline: "",
    items: facts.offer.services.slice(0, 3) as string[],
    cta: "",
    contact,
    durationSec: 7,
  });
  const set = (k: string, v: unknown) => setSpec((s) => ({ ...s, [k]: v }));
  const [frames, setFrames] = useState<J[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    const t = setTimeout(() => {
      api<J>("POST", `/api/sites/${id}/motion/preview`, spec).then(
        (r) => setFrames(r.frames),
        (e) => setMsg({ ok: false, text: errText(e) }),
      );
    }, 350);
    return () => clearTimeout(t);
  }, [key]);
  return (
    <div className="stack">
      {!o.motion.exportAvailable && (
        <Notice kind="info">
          Video export is not set up on this server yet. You can still preview
          the motion and save the still images.
        </Notice>
      )}
      <form
        className="card stack"
        aria-label="Plan a video"
        onSubmit={async (e) => {
          e.preventDefault();
          setMsg(null);
          try {
            await api("POST", `/api/sites/${id}/motion`, spec);
            setMsg({
              ok: true,
              text: "Queued. It will appear below when ready.",
            });
            jobs.reload();
          } catch (x) {
            setMsg({ ok: false, text: errText(x) });
          }
        }}
      >
        <label>
          Template
          <select
            value={spec.template}
            onChange={(e) => set("template", e.target.value)}
          >
            {o.motion.templates.map((t: string) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shape
          <select
            value={spec.format}
            onChange={(e) => set("format", e.target.value)}
          >
            {o.motion.formats.map((f: J) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Headline
          <input
            value={spec.headline}
            maxLength={60}
            required
            onChange={(e) => set("headline", e.target.value)}
          />
        </label>
        <label>
          Short line
          <input
            value={spec.subline}
            maxLength={120}
            onChange={(e) => set("subline", e.target.value)}
          />
        </label>
        <label>
          List (one per line, up to 4)
          <textarea
            rows={3}
            value={spec.items.join("\n")}
            onChange={(e) =>
              set(
                "items",
                e.target.value
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean)
                  .slice(0, 4),
              )
            }
          />
        </label>
        <label>
          Button text
          <input
            value={spec.cta}
            maxLength={28}
            onChange={(e) => set("cta", e.target.value)}
          />
        </label>
        {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
        <div className="row">
          <button className="btn" disabled={!o.motion.exportAvailable}>
            Make video
          </button>
        </div>
      </form>
      <ul className="k-frames" aria-label="Preview frames">
        {frames.map((f) => (
          <li key={f.t}>
            <img
              alt={`Preview at ${Number(f.t).toFixed(1)} seconds`}
              src={svgUrl(f.svg)}
            />
          </li>
        ))}
      </ul>
      <Async state={jobs}>
        {(rows) => (
          <ul className="k-checks">
            {rows.map((j) => (
              <li key={j.id} className="k-check stack">
                <div className="row between">
                  <strong>{j.spec.headline}</strong>
                  <Status kind={JOB[j.status]?.kind ?? "wait"}>
                    {JOB[j.status]?.text ?? j.status}
                  </Status>
                </div>
                {j.status === "READY" && j.assetId && (
                  <video
                    controls
                    preload="metadata"
                    src={`/api/sites/${id}/assets/${j.assetId}/file`}
                  />
                )}
                {j.status === "FAILED" && (
                  <>
                    <p className="muted">{j.error}</p>
                    <button
                      className="btn sm"
                      onClick={async () => {
                        await api(
                          "POST",
                          `/api/sites/${id}/motion/${j.id}/retry`,
                        );
                        jobs.reload();
                      }}
                    >
                      Try again
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Async>
    </div>
  );
}
