import { useState } from "react";
import { api, type J } from "../api";
import { Async, Notice, errText, useLoad } from "../ui";

const FORMAT_LABEL: Record<string, string> = {
  "social-square": "Square post",
  "social-portrait": "Portrait post",
  story: "Story",
  "whatsapp-status": "WhatsApp status",
  banner: "Banner",
  "flyer-a5": "Flyer (A5)",
  "carousel-cover": "Carousel cover",
};
const NUDGES: Array<[string, string]> = [
  ["premium", "More premium"],
  ["bolder", "Bolder"],
  ["calmer", "Calmer"],
  ["playful", "More playful"],
  ["warmer", "Warmer"],
  ["darker", "Darker"],
  ["lighter", "Lighter"],
  ["editorial", "More editorial"],
  ["product-focused", "Product first"],
  ["minimal", "More minimal"],
];

/** The owner-facing Brand OS: "this is how Kora represents my business". Advanced fields stay hidden. */
export function BrandOsPanel({ siteId }: { siteId: string }) {
  const os = useLoad(
    () => api<J>("GET", `/api/sites/${siteId}/brand-os`),
    [siteId],
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const nudge = async (n: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", `/api/sites/${siteId}/edit`, {
        designEdit: { kind: "nudge", nudge: n },
      });
      setMsg({
        ok: true,
        text: "Done. This saved a new draft of your website with the updated brand. Nothing is published until you publish it.",
      });
      os.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  const backfill = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", `/api/sites/${siteId}/brand-os/backfill`, {});
      setMsg({
        ok: true,
        text: "Done. This is what Kora worked out from your website. Nothing was published or changed.",
      });
      os.reload();
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Async state={os}>
      {(d) => {
        const cur = d.current;
        if (!cur)
          return (
            <section className="card stack" aria-labelledby="bos-h">
              <h2 id="bos-h">Your brand system</h2>
              <p className="muted">
                Kora builds a full brand system when you create a website with
                the new design engine: strategy, colours, type, voice and rules
                that every flyer, post and story will follow.
              </p>
              <p className="muted">
                Already have a website made earlier? Kora can read its colours
                and type and write them down as your brand system. It is marked
                as worked out from your site, and your website is not changed.
              </p>
              <div className="row">
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() => void backfill()}
                >
                  Work out my brand from my website
                </button>
              </div>
              {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
            </section>
          );
        const b = cur.brandOs;
        const p = b.visual.palette;
        return (
          <section className="card stack" aria-labelledby="bos-h">
            <p className="k-overline">Brand system · version {cur.version}</p>
            {b.provenance?.createdBy === "inferred-from-site" && (
              <Notice kind="info">
                Worked out from your earlier website, not chosen by you. Kora
                could not know: {b.provenance.inferred?.unknown.join("; ")}.
                Change anything below to make it yours.
              </Notice>
            )}
            <h2 id="bos-h">
              {b.grammarId ? b.strategy.brandEssence : "Your brand"}
            </h2>
            <p>
              <strong>{d.current.brandOs.name}</strong> is set in the{" "}
              <em>{b.strategy.visualTension}</em> direction.{" "}
              {b.strategy.positioning}
            </p>
            <ul className="k-swatches" aria-label="Brand colours">
              {Object.entries(p).map(([k, hex]) => (
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
            <p className="small">
              Type: <strong>{b.visual.typeVoice.replace(/-/g, " ")}</strong> ·
              Signature device:{" "}
              <strong>
                {b.visual.signatureMotif === "none"
                  ? "type and space"
                  : b.visual.signatureMotif.replace(/-/g, " ")}
              </strong>{" "}
              · Voice: {b.voice.tone}
            </p>
            <div className="row" style={{ gap: 24, alignItems: "flex-start" }}>
              <div>
                <h3 className="small">Always</h3>
                <ul className="small">
                  {b.rules.dos.slice(0, 4).map((x: string) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="small">Never</h3>
                <ul className="small">
                  {b.rules.donts.slice(0, 5).map((x: string) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="row" role="group" aria-label="Change the look">
              {NUDGES.map(([k, label]) => (
                <button
                  key={k}
                  className="btn sm ghost"
                  disabled={busy}
                  onClick={() => void nudge(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="small muted">
              {d.taste.note} Changing the brand creates version{" "}
              {cur.version + 1}. Posters and posts you already made keep the
              version they were made with.
            </p>
            {d.history.length > 1 && (
              <p className="small muted">
                History:{" "}
                {d.history
                  .map(
                    (h: { version: number; directionName: string }) =>
                      `v${h.version} ${h.directionName}`,
                  )
                  .join(" · ")}
              </p>
            )}
            {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
          </section>
        );
      }}
    </Async>
  );
}

/** One message, several formats, one brand: the coordinated creative set. */
export function CreativeSetPanel({ siteId }: { siteId: string }) {
  const [headline, setHeadline] = useState("");
  const [cta, setCta] = useState("");
  const [formats, setFormats] = useState<string[]>([
    "social-square",
    "story",
    "flyer-a5",
  ]);
  const [out, setOut] = useState<J | null>(null);
  const lib = useLoad(
    () => api<J>("GET", `/api/sites/${siteId}/media-library`),
    [siteId],
  );
  const [photoId, setPhotoId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const toggle = (f: string) =>
    setFormats((x) =>
      x.includes(f) ? x.filter((y) => y !== f) : [...x, f].slice(0, 6),
    );
  const make = async () => {
    setBusy(true);
    setErr("");
    try {
      setOut(
        await api<J>("POST", `/api/sites/${siteId}/artifacts/bundle`, {
          headline,
          cta,
          formats,
          objective: "announcement",
        }),
      );
    } catch (x) {
      setErr(errText(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack" aria-labelledby="cset-h">
      <h2 id="cset-h">Make a matching set</h2>
      <p className="muted">
        One message, drawn for each place you will use it, all in your brand.
        Review them before you post anything.
      </p>
      <label>
        What do you want to say?
        <input
          value={headline}
          maxLength={80}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder="e.g. Book your Saturday cut"
        />
      </label>
      <label>
        What should people do?
        <input
          value={cta}
          maxLength={30}
          onChange={(e) => setCta(e.target.value)}
          placeholder="e.g. Book a haircut"
        />
      </label>
      {lib.data?.items?.some((x: J) => x.kind === "photo") && (
        <label>
          Picture to use (optional)
          <select value={photoId} onChange={(e) => setPhotoId(e.target.value)}>
            <option value="">No picture: a brand graphic</option>
            {lib.data.items
              .filter((x: J) => x.kind === "photo")
              .map((x: J, i: number) => (
                <option key={x.id} value={x.id}>
                  Photo {i + 1}
                  {x.alt ? `: ${x.alt}` : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      <fieldset className="row" style={{ border: 0, padding: 0 }}>
        <legend className="small muted">Formats</legend>
        {Object.entries(FORMAT_LABEL).map(([f, label]) => (
          <label key={f} className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              style={{ width: 20, minHeight: 20 }}
              checked={formats.includes(f)}
              onChange={() => toggle(f)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div>
        <button
          className="btn"
          disabled={busy || !headline.trim() || formats.length === 0}
          onClick={() => void make()}
        >
          {busy ? "Designing…" : "Create set"}
        </button>
      </div>
      {err && <Notice kind="bad">{err}</Notice>}
      {out && (
        <div className="stack">
          <p className="small muted">
            Created, not posted. Kora cannot post for you yet: download each one
            and post it yourself, or send it through the calendar.
          </p>
          <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
            {out.results.map((r: J) =>
              r.asset ? (
                <figure key={r.asset.id} style={{ margin: 0, maxWidth: 220 }}>
                  <img
                    src={`/api/sites/${siteId}/assets/${r.asset.id}/file`}
                    alt={`${FORMAT_LABEL[r.asset.format] ?? r.asset.format} for: ${headline}`}
                    style={{ width: "100%", border: "1px solid #ccc" }}
                  />
                  <figcaption className="small muted">
                    {FORMAT_LABEL[r.asset.format] ?? r.asset.format}
                  </figcaption>
                </figure>
              ) : (
                <Notice key={r.format} kind="bad">
                  {r.format}: {r.error}
                </Notice>
              ),
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** "I need more birthday cake orders next week": Kora proposes a coordinated set; nothing is made until the owner says so. */
export function CampaignAskPanel({ siteId }: { siteId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<J | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setProposal(null);
    try {
      setProposal(
        await api<J>("POST", `/api/sites/${siteId}/campaign-proposal`, {
          request: text,
        }),
      );
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  const make = async () => {
    if (!proposal) return;
    setBusy(true);
    setMsg(null);
    try {
      const campaignId = `c-${Date.now().toString(36)}`;
      for (const p of proposal.pieces as J[])
        await api("POST", `/api/sites/${siteId}/artifacts`, {
          ...p.draft,
          campaignId,
        });
      setMsg({
        ok: true,
        text: "Drafts made. Review each one below; nothing has been posted.",
      });
      setProposal(null);
    } catch (x) {
      setMsg({ ok: false, text: errText(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card stack" aria-labelledby="ask-h">
      <h2 id="ask-h">Tell Kora what you need</h2>
      <form className="row" onSubmit={(e) => void ask(e)}>
        <label className="grow">
          <span className="small muted">
            For example: I need more birthday cake orders next week
          </span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={400}
            required
            minLength={3}
            aria-label="Describe what you want"
          />
        </label>
        <button className="btn" disabled={busy}>
          Plan it
        </button>
      </form>
      {msg && <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
      {proposal && (
        <div className="stack">
          <p>
            Goal: <strong>{proposal.understood.goal}</strong> · About:{" "}
            <strong>{proposal.understood.subject}</strong> · When:{" "}
            <strong>{proposal.understood.window.label}</strong>
          </p>
          <ol className="small">
            {(proposal.pieces as J[]).map((p) => (
              <li key={p.format}>
                <strong>{FORMAT_LABEL[p.format] ?? p.format}</strong>, around{" "}
                {p.suggestedOn}: {p.purpose}
              </li>
            ))}
          </ol>
          <div>
            <p className="small">Kora still needs from you:</p>
            <ul className="small">
              {(proposal.needsFromOwner as string[]).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
          <p className="small muted">{proposal.next}</p>
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void make()}>
              Make these drafts
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
