import { useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, ago, when, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";

const LABEL: Record<
  string,
  { kind: "ok" | "warn" | "bad" | "info" | "wait"; text: string }
> = {
  NEW: { kind: "bad", text: "New" },
  NEEDS_REPLY: { kind: "bad", text: "Needs reply" },
  FOLLOW_UP: { kind: "info", text: "Follow up" },
  WON: { kind: "ok", text: "Won" },
  LOST: { kind: "wait", text: "Lost" },
  CLOSED: { kind: "wait", text: "Closed" },
};
const FILTERS: Array<[string, string]> = [
  ["", "All"],
  ["NEW,NEEDS_REPLY", "Waiting"],
  ["FOLLOW_UP", "Follow up"],
  ["WON", "Won"],
  ["LOST,CLOSED", "Closed"],
];
const SOURCE: Record<string, string> = {
  WEBSITE_FORM: "Website",
  WHATSAPP: "WhatsApp",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  MANUAL: "Added by you",
};

export function CustomersEntry() {
  const sites = useLoad(() => api<J[]>("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) =>
        rows.length ? (
          <Navigate to={`/app/sites/${rows[0].id}/customers`} replace />
        ) : (
          <Empty title="No customers yet">
            Customers arrive through your website and your connected channels.
            Create a website first.
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

export function CustomersPage() {
  const { id } = useParams();
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const data = useLoad(
    () =>
      api<J>(
        "GET",
        `/api/sites/${id}/leads${filter ? `?status=${filter}` : ""}`,
      ),
    [id, filter],
    15000,
  );
  return (
    <div className="stack">
      <Async state={data}>
        {(d) => (
          <>
            <section className="card stack" aria-live="polite">
              <p className="k-overline">Customers</p>
              <h2>
                {d.counts.waiting === 0
                  ? "Nobody is waiting for a reply."
                  : `${d.counts.waiting} customer${d.counts.waiting === 1 ? " is" : "s are"} waiting for a reply.`}
              </h2>
              {d.counts.waitingOverDay > 0 && (
                <Notice kind="warn">
                  {d.counts.waitingOverDay} of them have waited more than a day.
                </Notice>
              )}
              {d.counts.followUpsDue > 0 && (
                <p>
                  {d.counts.followUpsDue} follow-up
                  {d.counts.followUpsDue === 1 ? " is" : "s are"} due.
                </p>
              )}
            </section>
            <div className="chips" role="group" aria-label="Filter customers">
              {FILTERS.map(([v, t]) => (
                <button
                  key={t}
                  className="chip"
                  aria-pressed={filter === v}
                  onClick={() => setFilter(v)}
                >
                  {t}
                </button>
              ))}
            </div>
            {d.leads.length === 0 ? (
              <Empty title="No enquiries here yet">
                When someone uses your website form or messages you on a
                connected channel, they appear here.
              </Empty>
            ) : (
              <ul className="k-checks">
                {d.leads.map((l: J) => (
                  <li key={l.id} className="k-check">
                    <button
                      className="k-lead"
                      aria-expanded={open === l.id}
                      onClick={() => setOpen(open === l.id ? null : l.id)}
                    >
                      <span className="row between">
                        <strong>
                          {l.customer.name ||
                            l.customer.phone ||
                            l.customer.email ||
                            "Unknown"}
                        </strong>
                        <Status kind={LABEL[l.status]?.kind ?? "wait"}>
                          {LABEL[l.status]?.text ?? l.status}
                        </Status>
                      </span>
                      <span className="muted">
                        {SOURCE[l.source] ?? l.source} ·{" "}
                        {ago(l.lastInboundAt ?? l.createdAt)}
                        {l.summary ? ` · ${l.summary}` : ""}
                      </span>
                    </button>
                    {open === l.id && (
                      <LeadDetail
                        siteId={id!}
                        leadId={l.id}
                        onChanged={data.reload}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Async>
    </div>
  );
}

function LeadDetail({
  siteId,
  leadId,
  onChanged,
}: {
  siteId: string;
  leadId: string;
  onChanged: () => void;
}) {
  const d = useLoad(
    () => api<J>("GET", `/api/sites/${siteId}/leads/${leadId}`),
    [leadId],
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<"reply_sent" | "note">("reply_sent");
  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      if (done) setMsg(done);
      d.reload();
      onChanged();
    } catch (e) {
      setErr(errText(e));
    }
  };
  // Opening a new lead marks it seen so the owner is not nagged about something they already read.
  useLoad(
    () =>
      api("POST", `/api/sites/${siteId}/leads/${leadId}/seen`).then(onChanged),
    [leadId],
  );
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    void act(
      async () => {
        await api("POST", `/api/sites/${siteId}/leads/${leadId}/messages`, {
          kind,
          body,
        });
        form.reset();
      },
      kind === "note" ? "Note saved." : "Reply recorded.",
    );
  };
  return (
    <Async state={d}>
      {(v) => (
        <div className="stack k-lead-detail">
          <p className="muted">
            {[v.lead.customer.phone, v.lead.customer.email]
              .filter(Boolean)
              .join(" · ") || "No contact details"}
          </p>
          <ol className="k-thread" aria-label="Conversation">
            {v.messages.map((m: J) => (
              <li key={m.id} data-dir={m.direction}>
                <span className="muted">
                  {m.direction === "IN"
                    ? "Customer"
                    : m.direction === "NOTE"
                      ? "Your note"
                      : "You"}{" "}
                  · {when(m.createdAt)}
                </span>
                <p>{m.body}</p>
              </li>
            ))}
          </ol>
          {v.whatsapp.link && (
            <p>
              <a
                className="btn sm"
                href={v.whatsapp.link}
                target="_blank"
                rel="noreferrer"
              >
                Reply on WhatsApp
              </a>{" "}
              <span className="muted">
                {v.lead.source === "WHATSAPP"
                  ? v.whatsapp.windowOpen
                    ? "You can reply freely until " +
                      when(v.whatsapp.windowClosesAt) +
                      "."
                    : "More than 24 hours since they wrote: only approved templates can be sent from the platform."
                  : "Opens WhatsApp on your phone."}
              </span>
            </p>
          )}
          <form
            onSubmit={submit}
            className="stack"
            aria-label="Record a reply or note"
          >
            <label>
              {kind === "note" ? "Private note" : "What you replied"}
              <textarea name="body" rows={3} maxLength={4000} required />
            </label>
            <div className="row">
              <button className="btn sm">
                {kind === "note" ? "Save note" : "I replied"}
              </button>
              <button
                type="button"
                className="btn sm quiet"
                onClick={() => setKind(kind === "note" ? "reply_sent" : "note")}
              >
                {kind === "note"
                  ? "Record a reply instead"
                  : "Write a private note instead"}
              </button>
            </div>
          </form>
          <div className="row">
            {["WON", "LOST", "CLOSED"].map((s) => (
              <button
                key={s}
                className="btn sm ghost"
                disabled={v.lead.status === s}
                onClick={() =>
                  act(() =>
                    api("POST", `/api/sites/${siteId}/leads/${leadId}/status`, {
                      status: s,
                    }),
                  )
                }
              >
                Mark {s.toLowerCase()}
              </button>
            ))}
            <button
              className="btn sm ghost"
              onClick={() =>
                act(
                  () =>
                    api(
                      "POST",
                      `/api/sites/${siteId}/leads/${leadId}/follow-ups`,
                      {
                        dueAt: new Date(Date.now() + 86_400_000).toISOString(),
                        note: "Follow up",
                      },
                    ),
                  "Reminder set for tomorrow.",
                )
              }
            >
              Remind me tomorrow
            </button>
          </div>
          {v.followUps
            .filter((f: J) => !f.doneAt)
            .map((f: J) => (
              <p key={f.id} className="row between">
                <span>
                  Follow up {when(f.dueAt)}
                  {f.note ? ` · ${f.note}` : ""}
                </span>
                <button
                  className="btn sm quiet"
                  onClick={() =>
                    act(() =>
                      api(
                        "POST",
                        `/api/sites/${siteId}/follow-ups/${f.id}/done`,
                      ),
                    )
                  }
                >
                  Done
                </button>
              </p>
            ))}
          {msg && <Notice kind="ok">{msg}</Notice>}
          {err && <Notice kind="bad">{err}</Notice>}
        </div>
      )}
    </Async>
  );
}
