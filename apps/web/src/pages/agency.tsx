import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, type J } from "../api";
import { Async, Empty, Notice, Status, errText, useLoad } from "../ui";

function ClientWorkspace({ site, close }: { site: J; close: () => void }) {
  const documents = useLoad(
    () => api<J[]>("GET", `/api/sites/${site.id}/creative-documents`),
    [site.id],
  );
  const motion = useLoad(
    () => api<J[]>("GET", `/api/sites/${site.id}/motion/projects`),
    [site.id],
  );
  const reviews = useLoad(
    () => api<J[]>("GET", `/api/sites/${site.id}/reviews`),
    [site.id],
  );
  const [message, setMessage] = useState<string | null>(null);
  const requestReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const [objectType, objectId, version] = String(form.get("asset")).split(
      ":",
    );
    try {
      await api("POST", `/api/sites/${site.id}/reviews`, {
        objectType,
        objectId,
        version: Number(version),
        title: String(form.get("title")),
      });
      setMessage("Review requested. The source revision is now explicit.");
      reviews.reload();
      event.currentTarget.reset();
    } catch (error) {
      setMessage(errText(error));
    }
  };
  const decide = async (review: J, decision: string) => {
    try {
      await api("POST", `/api/sites/${site.id}/reviews/${review.id}/decision`, {
        decision,
        note: "Decision recorded from the agency workspace.",
      });
      reviews.reload();
    } catch (error) {
      setMessage(errText(error));
    }
  };
  const share = async (review: J) => {
    try {
      const result = await api<J>(
        "POST",
        `/api/sites/${site.id}/reviews/${review.id}/share`,
        { days: 7 },
      );
      await navigator.clipboard.writeText(
        `${window.location.origin}/api/public/review-preview/${result.token}`,
      );
      setMessage("Private seven-day preview link copied.");
    } catch (error) {
      setMessage(errText(error));
    }
  };
  return (
    <section className="card stack" aria-label={`${site.name} client project`}>
      <div className="row between">
        <div>
          <p className="k-overline">Client project</p>
          <h2>{site.name}</h2>
        </div>
        <button className="btn sm quiet" onClick={close}>
          Close
        </button>
      </div>
      <div className="row">
        <Link className="btn sm" to={`/app/sites/${site.id}`}>
          Open workspace
        </Link>
        <Link className="btn sm ghost" to={`/app/sites/${site.id}/brand`}>
          Brand Kit
        </Link>
        <Link
          className="btn sm ghost"
          to={`/app/sites/${site.id}/creative-studio`}
        >
          Designs
        </Link>
        <Link className="btn sm ghost" to={`/app/sites/${site.id}/campaigns`}>
          Campaigns
        </Link>
      </div>
      <form className="stack" onSubmit={requestReview}>
        <h3>Request a versioned review</h3>
        <label>
          Asset revision
          <select name="asset" required defaultValue="">
            <option value="" disabled>
              Choose an editable source…
            </option>
            {(documents.data ?? []).map((document) => (
              <option
                key={`creative:${document.id}`}
                value={`creative_document:${document.id}:${document.revision}`}
              >
                {document.title} · design revision {document.revision}
              </option>
            ))}
            {(motion.data ?? []).map((project) => (
              <option
                key={`motion:${project.id}`}
                value={`motion_project:${project.id}:${project.revision}`}
              >
                {project.name} · video revision {project.revision}
              </option>
            ))}
          </select>
        </label>
        <label>
          Review title
          <input name="title" required maxLength={160} />
        </label>
        <div className="row">
          <button className="btn sm">Send for review</button>
        </div>
      </form>
      {message && <Notice>{message}</Notice>}
      <h3>Approval queue</h3>
      <Async state={reviews}>
        {(rows) =>
          rows.length ? (
            <ul className="k-checks">
              {rows.map((review) => {
                const status = String(review.status);
                return (
                  <li className="k-check stack" key={review.id}>
                    <div className="row between">
                      <strong>{review.title}</strong>
                      <Status kind={status === "APPROVED" ? "ok" : "wait"}>
                        {status.toLowerCase().replaceAll("_", " ")}
                      </Status>
                    </div>
                    <p className="muted">
                      {String(review.object_type).replaceAll("_", " ")} ·
                      revision {review.version} · {review.comments} comments
                    </p>
                    <div className="row">
                      {status === "IN_REVIEW" && (
                        <>
                          <button
                            className="btn sm"
                            onClick={() => decide(review, "APPROVED")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn sm ghost"
                            onClick={() => decide(review, "CHANGES_REQUESTED")}
                          >
                            Request changes
                          </button>
                          <button
                            className="btn sm quiet"
                            onClick={() => decide(review, "REJECTED")}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        className="btn sm ghost"
                        onClick={() => share(review)}
                      >
                        Copy client preview
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="No reviews yet">
              Choose a saved design or video revision above.
            </Empty>
          )
        }
      </Async>
    </section>
  );
}

export function AgencyPage() {
  const workspaces = useLoad(
    () => api<J[]>("GET", "/api/agency/workspaces"),
    [],
  );
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<J | null>(null);
  const visible = useMemo(
    () =>
      (workspaces.data ?? [])
        .flatMap((workspace) =>
          (workspace.clients ?? []).map((client: J) => ({
            ...client,
            organizationName: workspace.name,
            organizationRole: workspace.role,
          })),
        )
        .filter((client) =>
          `${client.name} ${client.organizationName}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
    [search, workspaces.data],
  );
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">Agency workspace</p>
        <h1 style={{ fontSize: "2rem", margin: 0 }}>
          Clients, reviews and delivery
        </h1>
        <p className="muted">
          Each client remains in its own organization and tenant boundary. Your
          agency account can switch between them without merging Brand Kits,
          assets or approvals.
        </p>
        <label>
          Find a client project
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Client or organization name"
          />
        </label>
      </section>
      <Async state={workspaces}>
        {() =>
          visible.length ? (
            <ul className="k-checks">
              {visible.map((client) => (
                <li className="k-check row between" key={client.id}>
                  <span>
                    <strong>{client.name}</strong>
                    <span className="muted">
                      {client.organizationName} ·{" "}
                      {String(client.organizationRole).toLowerCase()}
                    </span>
                  </span>
                  <button
                    className="btn sm"
                    onClick={() => setSelected(client)}
                  >
                    Manage project
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No matching client workspaces">
              Create or join a separate organization for each client to preserve
              isolation.
            </Empty>
          )
        }
      </Async>
      {selected && (
        <ClientWorkspace site={selected} close={() => setSelected(null)} />
      )}
    </div>
  );
}
