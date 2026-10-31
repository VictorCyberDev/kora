import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, when, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";

const STATE: Record<
  string,
  { kind: "ok" | "warn" | "bad" | "info" | "wait"; text: string }
> = {
  IDEA: { kind: "wait", text: "Idea" },
  DRAFT: { kind: "wait", text: "Draft" },
  APPROVAL_NEEDED: { kind: "warn", text: "Needs your approval" },
  APPROVED: { kind: "info", text: "Approved" },
  SCHEDULED: { kind: "info", text: "Scheduled" },
  PUBLISHING: { kind: "info", text: "Posting now" },
  PUBLISHED: { kind: "ok", text: "Posted" },
  FAILED: { kind: "bad", text: "Did not post" },
  PARTIALLY_PUBLISHED: { kind: "warn", text: "Posted to some" },
  CANCELLED: { kind: "wait", text: "Cancelled" },
};
const dayKey = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "No date yet";
const localInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

export function CalendarPage() {
  const { id } = useParams();
  const cal = useLoad(
    () => api<J>("GET", `/api/sites/${id}/calendar`),
    [id],
    10000,
  );
  const assets = useLoad(
    () => api<J[]>("GET", `/api/sites/${id}/assets`),
    [id],
  );
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Calendar</p>
        <h2>What goes out, and when</h2>
        <Async state={cal}>
          {(c) => (
            <p className="muted">
              {c.stats.pending} waiting or scheduled · {c.stats.published}{" "}
              posted in the last 30 days
              {c.stats.lastPublishedAt
                ? ` · last post ${when(c.stats.lastPublishedAt)}`
                : ""}
            </p>
          )}
        </Async>
        <div className="row">
          <button className="btn" onClick={() => setCreating(!creating)}>
            {creating ? "Close" : "New post"}
          </button>
        </div>
      </section>
      {creating && (
        <Async state={cal}>
          {(c) => (
            <NewPost
              id={id!}
              channels={c.channels}
              assets={assets.data ?? []}
              onDone={() => {
                setCreating(false);
                cal.reload();
              }}
            />
          )}
        </Async>
      )}
      <Async state={cal}>
        {(c) => {
          if (!c.items.length)
            return (
              <Empty title="Nothing planned yet">
                Write a post in Create, or start one here. Nothing goes out
                until you approve it.
              </Empty>
            );
          const groups = new Map<string, J[]>();
          for (const it of c.items as J[]) {
            const k = dayKey(it.scheduledFor);
            groups.set(k, [...(groups.get(k) ?? []), it]);
          }
          return (
            <div className="stack">
              {[...groups].map(([day, items]) => (
                <section key={day} aria-label={day}>
                  <h3>{day}</h3>
                  <ul className="k-checks">
                    {items.map((it) => (
                      <li key={it.id} className="k-check">
                        <button
                          className="k-lead"
                          aria-expanded={open === it.id}
                          onClick={() => setOpen(open === it.id ? null : it.id)}
                        >
                          <span className="row between">
                            <strong>{it.title}</strong>
                            <Status kind={STATE[it.state]?.kind ?? "wait"}>
                              {STATE[it.state]?.text ?? it.state}
                            </Status>
                          </span>
                          <span className="muted">
                            {it.channels
                              .map(
                                (x: string) =>
                                  c.channels.find((k: J) => k.provider === x)
                                    ?.label ?? x,
                              )
                              .join(", ") || "No channel yet"}
                            {it.scheduledFor
                              ? ` · ${new Date(it.scheduledFor).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
                              : ""}
                          </span>
                        </button>
                        {open === it.id && (
                          <ItemDetail
                            id={id!}
                            itemId={it.id}
                            onChanged={cal.reload}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </Async>
    </div>
  );
}

function NewPost({
  id,
  channels,
  assets,
  onDone,
}: {
  id: string;
  channels: J[];
  assets: J[];
  onDone: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const picked = channels
      .filter((c) => f.get(`ch-${c.provider}`))
      .map((c) => c.provider);
    const at = String(f.get("at") ?? "");
    try {
      await api("POST", `/api/sites/${id}/calendar/items`, {
        title: String(f.get("title")),
        caption: {
          headline: "",
          body: String(f.get("body")),
          cta: "",
          hashtags: [],
        },
        channels: picked,
        ...(f.get("asset") ? { assetId: String(f.get("asset")) } : {}),
        ...(at ? { scheduledFor: new Date(at).toISOString() } : {}),
      });
      onDone();
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <form className="card stack" onSubmit={submit} aria-label="New post">
      <label>
        Name (only you see this)
        <input name="title" required maxLength={120} />
      </label>
      <label>
        Post text
        <textarea name="body" rows={5} required maxLength={2200} />
      </label>
      <fieldset>
        <legend>Where</legend>
        {channels.map((c) => (
          <label key={c.provider} className="row">
            <input type="checkbox" name={`ch-${c.provider}`} />
            {c.label}
            {!c.canPost && (
              <span className="muted"> (you post it yourself)</span>
            )}
          </label>
        ))}
      </fieldset>
      <label>
        Image or video
        <select name="asset" defaultValue="">
          <option value="">None</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.kind === "VIDEO" ? "Video" : "Image"} · {a.format} ·{" "}
              {a.spec.headline ?? a.category}
            </option>
          ))}
        </select>
      </label>
      <label>
        Date and time
        <input name="at" type="datetime-local" />
      </label>
      {err && <Notice kind="bad">{err}</Notice>}
      <div className="row">
        <button className="btn">Save post</button>
      </div>
    </form>
  );
}

function ItemDetail({
  id,
  itemId,
  onChanged,
}: {
  id: string;
  itemId: string;
  onChanged: () => void;
}) {
  const d = useLoad(
    () => api<J>("GET", `/api/sites/${id}/calendar/items/${itemId}`),
    [itemId],
    5000,
  );
  const [err, setErr] = useState<string | null>(null);
  const [when_, setWhen] = useState("");
  const act = async (path: string, body?: unknown) => {
    setErr(null);
    try {
      await api(
        "POST",
        `/api/sites/${id}/calendar/items/${itemId}/${path}`,
        body,
      );
      d.reload();
      onChanged();
    } catch (x) {
      setErr(errText(x));
    }
  };
  return (
    <Async state={d}>
      {(v) => {
        const it = v.item;
        const blocks = Object.entries(v.issues as Record<string, J[]>).flatMap(
          ([ch, list]) => list.map((i) => ({ ch, ...i })),
        );
        return (
          <div className="stack k-lead-detail">
            <p style={{ whiteSpace: "pre-wrap" }}>{it.caption.body}</p>
            {blocks.map((i) => (
              <Notice
                key={`${i.ch}${i.message}`}
                kind={i.severity === "block" ? "warn" : "info"}
              >
                {i.message}
              </Notice>
            ))}
            {v.jobs.map((j: J) => (
              <p key={j.id} className="row between">
                <span>
                  {v.handoff.find((h: J) => h.provider === j.provider)?.label ??
                    j.provider}
                  : {j.state.toLowerCase()}
                  {j.method === "MANUAL"
                    ? " (posted by you)"
                    : j.method === "SANDBOX"
                      ? " (test)"
                      : ""}
                </span>
                {j.error && <span className="muted">{j.error}</span>}
              </p>
            ))}
            {it.state === "APPROVED" && (
              <label>
                Post at
                <input
                  type="datetime-local"
                  value={when_ || localInput(it.scheduledFor)}
                  onChange={(e) => setWhen(e.target.value)}
                />
              </label>
            )}
            <div className="row">
              {(it.state === "DRAFT" || it.state === "IDEA") && (
                <button className="btn sm" onClick={() => act("submit")}>
                  Ask for approval
                </button>
              )}
              {it.state === "APPROVAL_NEEDED" && (
                <button className="btn sm" onClick={() => act("approve")}>
                  Approve this post
                </button>
              )}
              {it.state === "APPROVED" && (
                <button
                  className="btn sm"
                  onClick={() =>
                    act(
                      "schedule",
                      when_
                        ? { scheduledFor: new Date(when_).toISOString() }
                        : {},
                    )
                  }
                >
                  {when_ ? "Schedule" : "Post now"}
                </button>
              )}
              {(it.state === "FAILED" ||
                it.state === "PARTIALLY_PUBLISHED") && (
                <button
                  className="btn sm"
                  onClick={() =>
                    act("retry", {
                      confirmNotPosted: window.confirm(
                        "Only continue if you checked and this is NOT already on the channel.",
                      ),
                    })
                  }
                >
                  Try again
                </button>
              )}
              {[
                "APPROVED",
                "SCHEDULED",
                "PUBLISHING",
                "FAILED",
                "PARTIALLY_PUBLISHED",
              ].includes(it.state) &&
                v.handoff
                  .filter(
                    (h: J) =>
                      !v.jobs.some(
                        (j: J) =>
                          j.provider === h.provider && j.state === "PUBLISHED",
                      ),
                  )
                  .map((h: J) => (
                    <button
                      key={h.provider}
                      className="btn sm ghost"
                      onClick={() =>
                        act("mark-posted", { provider: h.provider })
                      }
                    >
                      I posted it on {h.label}
                    </button>
                  ))}
              {["DRAFT", "APPROVAL_NEEDED"].includes(it.state) &&
                it.channels.length > 0 &&
                !it.caption.body.includes("k=") && (
                  <button
                    className="btn sm ghost"
                    onClick={async () => {
                      try {
                        const r = await api<J>(
                          "POST",
                          `/api/sites/${id}/calendar/items/${itemId}/tracked-link`,
                        );
                        await api(
                          "PATCH",
                          `/api/sites/${id}/calendar/items/${itemId}`,
                          {
                            caption: {
                              ...it.caption,
                              body: `${it.caption.body}\n\n${r.url}`.slice(
                                0,
                                2200,
                              ),
                            },
                          },
                        );
                        d.reload();
                        onChanged();
                      } catch (x) {
                        setErr(errText(x));
                      }
                    }}
                  >
                    Add a link Kora can track
                  </button>
                )}
              <button
                className="btn sm ghost"
                onClick={async () => {
                  const p = await api<J>(
                    "GET",
                    `/api/sites/${id}/calendar/items/${itemId}/package`,
                  );
                  void navigator.clipboard?.writeText(p.text);
                }}
              >
                Copy text
              </button>
              {![
                "PUBLISHING",
                "PUBLISHED",
                "PARTIALLY_PUBLISHED",
                "CANCELLED",
              ].includes(it.state) && (
                <button className="btn sm quiet" onClick={() => act("cancel")}>
                  Cancel
                </button>
              )}
            </div>
            {v.approvals.length > 0 && (
              <p className="muted">
                Approval history:{" "}
                {v.approvals
                  .map(
                    (a: J) =>
                      `${a.decision.toLowerCase()} ${when(a.createdAt)}`,
                  )
                  .join(" · ")}
              </p>
            )}
            {err && <Notice kind="bad">{err}</Notice>}
          </div>
        );
      }}
    </Async>
  );
}
