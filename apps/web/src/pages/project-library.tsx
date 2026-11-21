import { Link } from "react-router-dom";
import { api } from "../api";
import { Async, useLoad } from "../ui";

type Graphic = {
  id: string;
  title: string;
  kind: string;
  revision: number;
  status: string;
  updated_at: string;
};
type Motion = {
  id: string;
  name: string;
  revision: number;
  renderStatus: string;
  updatedAt: string;
};

export function ProjectLibrary({ siteId }: { siteId: string }) {
  const graphics = useLoad(
    () => api<Graphic[]>("GET", `/api/sites/${siteId}/creative-documents`),
    [siteId],
  );
  const motion = useLoad(
    () => api<Motion[]>("GET", `/api/sites/${siteId}/motion/projects`),
    [siteId],
  );
  const root = `/app/sites/${siteId}`;
  return (
    <section className="card stack" aria-labelledby="krev-projects-title">
      <div className="row between">
        <h2 id="krev-projects-title">Recent creative projects</h2>
        <Link to={`${root}/create`}>Create something</Link>
      </div>
      <p className="small muted">
        Website versions, graphics and motion remain in their authoritative
        editors. This is one view of your saved work, not a duplicate editor.
      </p>
      <div className="row">
        <Link to={`${root}/website-studio`}>Website editor</Link>
        <Link to={`${root}/creative-studio`}>Graphics and logos</Link>
        <Link to={`${root}/create`}>Motion and posts</Link>
      </div>
      <Async state={graphics}>
        {(items) =>
          items.length === 0 ? (
            <p className="muted small">No saved graphics or logos yet.</p>
          ) : (
            <ul className="k-checks">
              {items.slice(0, 10).map((item) => (
                <li key={item.id} className="k-check">
                  <Link
                    to={`${root}/creative-studio?document=${encodeURIComponent(item.id)}`}
                  >
                    {item.title}
                  </Link>
                  <span className="small muted">
                    {" "}
                    — {item.kind} · revision {item.revision} · {item.status}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      <Async state={motion}>
        {(items) =>
          items.length === 0 ? (
            <p className="muted small">No saved motion projects yet.</p>
          ) : (
            <ul className="k-checks">
              {items.slice(0, 10).map((item) => (
                <li key={item.id} className="k-check">
                  <Link to={`${root}/create`}>{item.name}</Link>
                  <span className="small muted">
                    {" "}
                    — motion · revision {item.revision} · {item.renderStatus}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </Async>
    </section>
  );
}
