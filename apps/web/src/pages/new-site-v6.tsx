import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type J } from "../api";
import { useAuth } from "../auth";
import { FEELS, GOALS } from "../design-labels";
import { localAiState, runLocalDesign, type LocalAiState } from "../local-ai";
import { preferredSite, reusableDraftSite } from "../site-selection";
import { Notice, errText } from "../ui";

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

type Direction = {
  index: number;
  name: string;
  summary: string;
  swatches: string[];
  previewUrl: string;
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

export function NewSite() {
  const { orgs } = useAuth();
  const nav = useNavigate();
  const orgId = orgs[0]?.id as string | undefined;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [previewSiteId, setPreviewSiteId] = useState<string | null>(null);
  const [targetSiteId, setTargetSiteId] = useState<string | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [dirs, setDirs] = useState<Direction[] | null>(null);
  const [stage, setStage] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [ai, setAi] = useState<LocalAiState>("unsupported");
  const [useAi, setUseAi] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [reusedShell, setReusedShell] = useState(false);

  useEffect(() => {
    void localAiState().then((st) => {
      setAi(st);
      setUseAi(st === "available");
    });
  }, []);

  const explainLimit = async (fallback: string) => {
    if (!orgId) return fallback;
    try {
      const [rows, sub] = await Promise.all([
        api<J[]>("GET", "/api/sites"),
        api<J>("GET", `/api/orgs/${orgId}/subscription`),
      ]);
      const allowed = Number(sub.subscription?.capabilities?.sites ?? 0);
      const empty = reusableDraftSite(rows);
      if (empty)
        return "Kora found an unfinished website shell from an earlier attempt and can reuse it. Try the design again.";
      if (allowed > 0)
        return `Your current plan allows ${allowed} website${allowed === 1 ? "" : "s"}, and ${rows.length} slot${rows.length === 1 ? " is" : "s are"} already in use. Existing websites stay live; manage the plan or finish an existing draft instead of creating another shell.`;
    } catch {
      // Preserve the server message if plan diagnostics cannot be loaded.
    }
    return fallback;
  };

  const describe = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    const b: Brief = {
      name: text("name"),
      description: text("description") ?? "",
      goal: text("goal"),
      feel: text("feel"),
      location: text("location"),
      whatsapp: text("whatsapp")?.replace(/\s/g, ""),
      email: text("email"),
      phone: text("phone"),
    };
    setBusy(true);
    setErr(null);
    setQuestions([]);
    setStage(1);
    try {
      if (!orgId)
        throw new Error(
          "Your workspace is not ready yet. Refresh and try again.",
        );
      const rows = await api<J[]>("GET", "/api/sites");
      let preview = preferredSite(rows);
      let reusable = reusableDraftSite(rows);

      // A first-time customer still needs one real site record because the
      // preview endpoint is site-scoped. For existing customers, previews use
      // an existing site and no longer consume another website slot.
      if (!preview) {
        const created = await api<J>("POST", "/api/sites", {
          orgId,
          name: b.name,
          description: b.description,
        });
        preview = created;
        reusable = created;
      }

      setPreviewSiteId(preview.id);
      setTargetSiteId(reusable?.id ?? null);
      setReusedShell(
        Boolean(reusable && rows.some((x) => x.id === reusable!.id)),
      );
      setBrief(b);
      const d = await api<Direction[]>(
        "POST",
        `/api/sites/${preview.id}/design/directions`,
        b,
      );
      setDirs(d);
      setStage(2);
    } catch (x) {
      if (x instanceof ApiError && x.status === 400) {
        setQuestions([
          "Please give the business a name and one or two sentences about what it does.",
        ]);
      } else if (x instanceof ApiError && x.status === 402) {
        setErr(await explainLimit(errText(x)));
      } else setErr(errText(x));
      setStage(0);
    } finally {
      setBusy(false);
    }
  };

  const ensureTargetSite = async (): Promise<string> => {
    if (!brief || !orgId) throw new Error("The website brief is missing.");
    if (targetSiteId) {
      await api("PATCH", `/api/sites/${targetSiteId}`, {
        name: brief.name,
        description: brief.description,
      });
      return targetSiteId;
    }

    // Refresh before consuming a slot: another old empty shell may exist from
    // the legacy flow and is safe to recycle.
    const rows = await api<J[]>("GET", "/api/sites");
    const reusable = reusableDraftSite(rows);
    if (reusable) {
      await api("PATCH", `/api/sites/${reusable.id}`, {
        name: brief.name,
        description: brief.description,
      });
      setTargetSiteId(reusable.id);
      setReusedShell(true);
      return reusable.id;
    }

    try {
      const created = await api<J>("POST", "/api/sites", {
        orgId,
        name: brief.name,
        description: brief.description,
      });
      setTargetSiteId(created.id);
      return created.id;
    } catch (x) {
      if (x instanceof ApiError && x.status === 402)
        throw new Error(await explainLimit(errText(x)));
      throw x;
    }
  };

  const build = async (direction: 0 | 1 | 2) => {
    if (!brief || !previewSiteId) return;
    setPicked(direction);
    setBusy(true);
    setErr(null);
    setStage(3);
    try {
      const siteId = await ensureTargetSite();
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
      await api("POST", `/api/sites/${siteId}/generate`, {
        ...brief,
        direction,
        ...(local
          ? { intelligence: local.text, intelligenceProvider: local.provider }
          : {}),
      });
      setStage(4);
      nav(`/app/sites/${siteId}/build`);
    } catch (x) {
      if (x instanceof ApiError && x.code === "more_details_needed") {
        setQuestions(x.body.questions);
        setDirs(null);
        setStage(0);
      } else setErr(errText(x));
      setBusy(false);
    }
  };

  if (dirs)
    return (
      <div className="stack">
        <div>
          <p className="k-overline">Design directions</p>
          <h1 style={{ fontSize: "2rem" }}>Pick a direction</h1>
          <p className="muted">
            Three different looks for the same business. Previewing these no
            longer creates another website in your plan.
          </p>
          {reusedShell && (
            <Notice kind="info">
              Kora found an empty website left by an earlier unfinished attempt.
              It will reuse that slot instead of creating another one.
            </Notice>
          )}
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
              {STAGES.map((l, i) => (
                <li
                  key={l}
                  data-s={
                    i < stage - 1 ? "done" : i === stage - 1 ? "doing" : "todo"
                  }
                >
                  <span className="dot" aria-hidden="true" />
                  {l}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <>
            <div className="dirs">
              {dirs.map((d) => (
                <div
                  key={d.index}
                  className="dir"
                  aria-current={picked === d.index}
                >
                  <ScaledFrame
                    src={d.previewUrl}
                    title={`Direction ${d.index + 1}: ${d.name}`}
                  />
                  <div>
                    <strong>{d.name}</strong>
                    <div className="small muted">{d.summary}</div>
                  </div>
                  <span className="chips" aria-hidden="true">
                    <span className="chip sw">
                      {d.swatches.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </span>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void build(d.index as 0 | 1 | 2)}
                  >
                    Use this direction
                  </button>
                </div>
              ))}
            </div>
            {err && <Notice kind="bad">{err}</Notice>}
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
      className="card stack narrow k-new-site-v6"
      style={{ maxWidth: 680 }}
      onSubmit={describe}
    >
      <p className="k-overline">New website</p>
      <h1 style={{ fontSize: "2rem" }}>Tell Kora about the business</h1>
      <p className="muted">
        Kora now treats the three designs as previews. A new website slot is
        consumed only after you choose a direction.
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
          <select name="goal" defaultValue="">
            {GOALS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          How should it feel?
          <select name="feel" defaultValue="">
            {FEELS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
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
            <input name="phone" type="tel" />
          </label>
          <label>
            WhatsApp number
            <input name="whatsapp" type="tel" placeholder="+234…" />
          </label>
          <label>
            Email
            <input name="email" type="email" />
          </label>
          <label>
            Location
            <input name="location" />
          </label>
        </div>
      </details>
      {questions.length > 0 && (
        <Notice kind="warn">
          <strong>Kora needs a little more:</strong>
          <ul>
            {questions.map((q) => (
              <li key={q}>{q}</li>
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
