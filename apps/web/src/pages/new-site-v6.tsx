import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError, type J } from "../api";
import { useAuth } from "../auth";
import { FEELS, GOALS } from "../design-labels";
import { localAiState, runLocalDesign, type LocalAiState } from "../local-ai";
import { Notice, errText, useLoad } from "../ui";

type Direction = {
  index: number;
  name: string;
  summary: string;
  swatches: string[];
  previewUrl: string;
  /** Present when the v3 creative engine designed it. */
  engine?: string;
  recommended?: boolean;
  essence?: string;
  signature?: string;
  why?: string;
  avoids?: string[];
};

type Brief = {
  name?: string;
  description: string;
  goal?: string;
  feel?: string;
  location?: string;
  whatsapp?: string;
  email?: string;
  phone?: string;
};

const STAGES = [
  "Reading what you wrote",
  "Designing three directions",
  "Building your site",
  "Checking quality and accessibility",
] as const;

function ScaledFrame({ src, title }: { src: string; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1280);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="shot" ref={box}>
      <iframe
        title={title}
        src={src}
        sandbox="allow-same-origin"
        loading="lazy"
        tabIndex={-1}
        style={{ ["--s" as string]: scale }}
      />
    </div>
  );
}

const isReusableEmptyDraft = (site: J) =>
  site.status !== "PUBLISHED" &&
  !site.currentVersionId &&
  !site.publishedVersionId;

export function NewSiteV6() {
  const { orgs } = useAuth();
  const orgId = orgs[0]?.id;
  const nav = useNavigate();
  const sites = useLoad<J[]>(() => api("GET", "/api/sites"), []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [dirs, setDirs] = useState<Direction[] | null>(null);
  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ai, setAi] = useState<LocalAiState>("unsupported");
  const [useAi, setUseAi] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  useEffect(() => {
    void localAiState().then((state) => {
      setAi(state);
      setUseAi(state === "available");
    });
  }, []);

  const describe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (key: string) => String(f.get(key) ?? "").trim() || undefined;
    const next: Brief = {
      name: text("name"),
      description: text("description") ?? "",
      goal: text("goal"),
      feel: text("feel"),
      location: text("location"),
      whatsapp: text("whatsapp")?.replace(/\s/g, ""),
      email: text("email"),
      phone: text("phone"),
    };

    if (!orgId) {
      setErr(
        "Kora could not find your business workspace. Sign out and back in, then try again.",
      );
      return;
    }

    setBusy(true);
    setErr(null);
    setQuestions([]);
    setStage(1);
    try {
      // Important: preview first. A Site row is not created merely because the
      // owner wants to compare directions, so abandoned previews cannot consume quota.
      const directions = await api<Direction[]>(
        "POST",
        "/api/design/directions",
        {
          orgId,
          ...next,
        },
      );
      setBrief(next);
      setDirs(directions);
      setStage(2);
    } catch (x) {
      if (x instanceof ApiError && x.status === 400) {
        setQuestions([
          "Please give the business a name and one or two sentences about what it does.",
        ]);
      } else {
        setErr(errText(x));
      }
      setStage(0);
    } finally {
      setBusy(false);
    }
  };

  const ensureTargetSite = async () => {
    if (!brief || !orgId) throw new Error("Missing website brief.");

    if (siteId) {
      await api("PATCH", `/api/sites/${siteId}`, {
        name: brief.name,
        description: brief.description,
      });
      return siteId;
    }

    // Reclaim an empty draft left by an older interrupted builder flow instead
    // of making the owner pay for that stale shell with their site allowance.
    const reusable = sites.data?.find(isReusableEmptyDraft);
    if (reusable) {
      await api("PATCH", `/api/sites/${reusable.id}`, {
        name: brief.name,
        description: brief.description,
      });
      setSiteId(reusable.id);
      return reusable.id as string;
    }

    try {
      const created = await api<J>("POST", "/api/sites", {
        orgId,
        name: brief.name,
        description: brief.description,
      });
      setSiteId(created.id);
      return created.id as string;
    } catch (x) {
      if (x instanceof ApiError && x.code === "plan_restriction") {
        throw new Error(
          "You have reached the number of websites included in this plan. Your existing website still works and can use Campaigns, Images and Studio. Open Websites to reuse an existing site, or manage your plan to add another website.",
        );
      }
      throw x;
    }
  };

  const build = async (direction: 0 | 1 | 2) => {
    if (!brief) return;
    setPicked(direction);
    setBusy(true);
    setErr(null);
    setStage(3);
    try {
      const targetId = await ensureTargetSite();

      let local: { text: string; provider: string } | null = null;
      if (useAi && (ai === "available" || ai === "downloadable")) {
        setAiNote(
          ai === "downloadable"
            ? "Preparing AI on this device…"
            : "Using on-device AI…",
        );
        try {
          const spec = await api("GET", "/api/design/intelligence");
          local = await runLocalDesign(brief, spec);
        } catch {
          local = null;
        }
        setAiNote(null);
      }

      await api("POST", `/api/sites/${targetId}/generate`, {
        ...brief,
        direction,
        ...(local
          ? { intelligence: local.text, intelligenceProvider: local.provider }
          : {}),
      });
      setStage(4);
      nav(`/app/sites/${targetId}/build`);
    } catch (x) {
      if (x instanceof ApiError && x.code === "more_details_needed") {
        setQuestions(x.body.questions);
        setDirs(null);
        setStage(0);
      } else {
        setErr(errText(x));
      }
      setBusy(false);
    }
  };

  if (dirs)
    return (
      <div className="stack k-builder-v6">
        <div className="k-builder-v6-head">
          <p className="k-overline">Website studio</p>
          <h1>Pick a direction that feels like your business.</h1>
          <p className="muted">
            These are three real rendered directions. Comparing them does not
            create another website or use up a website slot.
          </p>
        </div>

        {busy && stage >= 3 ? (
          <div
            className="card stack narrow"
            style={{ maxWidth: 520 }}
            aria-live="polite"
          >
            <h2 style={{ fontSize: "1.4rem" }}>Building your website</h2>
            {aiNote && <p className="small muted">{aiNote}</p>}
            <ol className="stages">
              {STAGES.map((label, index) => (
                <li
                  key={label}
                  data-s={
                    index < stage - 1
                      ? "done"
                      : index === stage - 1
                        ? "doing"
                        : "todo"
                  }
                >
                  <span className="dot" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            <div className="dirs">
              {dirs.map((direction) => (
                <div
                  key={direction.index}
                  className="dir"
                  aria-current={picked === direction.index}
                >
                  <ScaledFrame
                    src={direction.previewUrl}
                    title={`Direction ${direction.index + 1}: ${direction.name}`}
                  />
                  <div>
                    <strong>{direction.name}</strong>
                    {direction.recommended && (
                      <span className="chip" style={{ marginLeft: 8 }}>
                        Kora recommends this
                      </span>
                    )}
                    <div className="small muted">{direction.summary}</div>
                    {direction.essence && (
                      <div className="small" style={{ marginTop: 6 }}>
                        {direction.essence}
                      </div>
                    )}
                    {direction.signature && (
                      <div className="small muted">
                        Signature: {direction.signature}
                        {direction.avoids?.length
                          ? ` · Avoids: ${direction.avoids.slice(0, 3).join(", ")}`
                          : ""}
                      </div>
                    )}
                  </div>
                  <span className="chips" aria-hidden="true">
                    <span className="chip sw">
                      {direction.swatches.map((color) => (
                        <i key={color} style={{ background: color }} />
                      ))}
                    </span>
                  </span>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void build(direction.index as 0 | 1 | 2)}
                  >
                    Use this direction
                  </button>
                </div>
              ))}
            </div>
            {err && (
              <Notice kind="bad">
                {err}
                <div className="row" style={{ marginTop: 10 }}>
                  <Link className="btn sm ghost" to="/app/sites">
                    Open my websites
                  </Link>
                  <Link className="btn sm quiet" to="/app/billing">
                    Manage plan
                  </Link>
                </div>
              </Notice>
            )}
            {(ai === "available" || ai === "downloadable") && (
              <label className="row" style={{ gap: 8 }}>
                <input
                  style={{ width: 20, minHeight: 20 }}
                  type="checkbox"
                  checked={useAi}
                  onChange={(e) => setUseAi(e.target.checked)}
                />
                <span>
                  Use AI on this device
                  <span className="small muted">
                    {ai === "downloadable"
                      ? " (one-time download; nothing is sent to a server for this step)"
                      : " (private; nothing is sent to a server for this step)"}
                  </span>
                </span>
              </label>
            )}
            <div className="row">
              <button
                className="btn ghost"
                disabled={busy}
                onClick={() => void build(0)}
              >
                Choose for me
              </button>
              <button
                className="btn quiet"
                disabled={busy}
                onClick={() => setDirs(null)}
              >
                Change what I wrote
              </button>
            </div>
          </>
        )}
      </div>
    );

  return (
    <form
      className="card stack narrow k-builder-v6-form"
      style={{ maxWidth: 680 }}
      onSubmit={describe}
    >
      <p className="k-overline">New website</p>
      <h1 style={{ fontSize: "2rem" }}>Tell Kora about your business</h1>
      <p className="muted">
        First compare three directions. Kora only creates the website after you
        choose one, so previewing can never trap you in a create-site loop.
      </p>
      <label>
        Business name
        <input
          name="name"
          required
          maxLength={100}
          defaultValue={String(brief?.name ?? "")}
        />
      </label>
      <label>
        What do you do?
        <textarea
          name="description"
          required
          minLength={12}
          defaultValue={String(brief?.description ?? "")}
          placeholder="We repair fridges, washing machines and cookers in Ikeja."
        />
        <span className="field-hint">
          Two lines is enough. Kora only uses what you write here. It will not
          invent services, prices or reviews.
        </span>
      </label>
      <div className="grid">
        <label>
          What matters most?
          <select name="goal" defaultValue={String(brief?.goal ?? "")}>
            {GOALS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          How should it feel?
          <select name="feel" defaultValue={String(brief?.feel ?? "")}>
            {FEELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Add contact details (optional)</summary>
        <div className="grid" style={{ marginTop: 12 }}>
          <label>
            Phone
            <input name="phone" type="tel" defaultValue={brief?.phone ?? ""} />
          </label>
          <label>
            WhatsApp number
            <input
              name="whatsapp"
              type="tel"
              placeholder="+234…"
              defaultValue={brief?.whatsapp ?? ""}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              defaultValue={brief?.email ?? ""}
            />
          </label>
          <label>
            Location
            <input name="location" defaultValue={brief?.location ?? ""} />
          </label>
        </div>
      </details>
      {questions.length > 0 && (
        <Notice kind="warn">
          <strong>Kora needs a little more:</strong>
          <ul>
            {questions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </Notice>
      )}
      {err && <Notice kind="bad">{err}</Notice>}
      <button className="btn" disabled={busy}>
        {busy ? "Designing…" : "Show me three designs"}
      </button>
    </form>
  );
}
