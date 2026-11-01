import { Link, Navigate } from "react-router-dom";
import { api, type J } from "../api";
import { preferredSite } from "../site-selection";
import { Async, Empty, Status, useLoad } from "../ui";

export function PresenceEntry() {
  const sites = useLoad(() => api<J[]>("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) => {
        const site = preferredSite(rows);
        return site ? (
          <Navigate to={`/app/sites/${site.id}/presence`} replace />
        ) : (
          <Empty title="No business profile yet">
            Presence starts with a website. Create one and Kora will build the
            profile from the facts you confirm.
            <p>
              <Link className="btn" to="/app/sites/new">
                Create my website
              </Link>
            </p>
          </Empty>
        );
      }}
    </Async>
  );
}

export function CustomersEntry() {
  const sites = useLoad(() => api<J[]>("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) => {
        const site = preferredSite(rows);
        return site ? (
          <Navigate to={`/app/sites/${site.id}/customers`} replace />
        ) : (
          <Empty title="No customers yet">
            Create your first website so Kora has somewhere to receive customer
            enquiries.
            <p>
              <Link className="btn" to="/app/sites/new">
                Create my website
              </Link>
            </p>
          </Empty>
        );
      }}
    </Async>
  );
}

export function MarketingEntry() {
  const sites = useLoad(() => api<J[]>("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) => {
        const site = preferredSite(rows);
        if (!site)
          return (
            <Empty title="Nothing to market yet">
              Create your first website, then Kora can build campaigns, images
              and posts around your business.
              <p>
                <Link className="btn" to="/app/sites/new">
                  Create my website
                </Link>
              </p>
            </Empty>
          );

        return (
          <div className="stack k-marketing-hub">
            <section className="k-panel k-panel-ink stack">
              <div className="row between">
                <div>
                  <p className="k-overline">Marketing workspace</p>
                  <h1 style={{ marginBottom: 8 }}>{site.name}</h1>
                </div>
                <Status kind={site.publicUrl ? "ok" : "info"}>
                  {site.publicUrl ? "Live website selected" : "Draft selected"}
                </Status>
              </div>
              <p>
                Campaigns and creative work now stay attached to this business.
                Kora will not send you through website creation again unless you
                explicitly choose New website.
              </p>
            </section>

            <section className="k-action-matrix" aria-label="Marketing actions">
              <Link className="k-action-card" to={`/app/sites/${site.id}/campaigns`}>
                <span className="k-overline">Campaigns</span>
                <strong>Launch one idea across every channel</strong>
                <span>Offers, campaign posts, approvals and channel-ready output.</span>
              </Link>
              <Link className="k-action-card" to={`/app/sites/${site.id}/images`}>
                <span className="k-overline">Images</span>
                <strong>Create branded campaign graphics</strong>
                <span>Flyers, social formats and reusable visual directions.</span>
              </Link>
              <Link className="k-action-card" to={`/app/sites/${site.id}/create`}>
                <span className="k-overline">Studio</span>
                <strong>Write posts and make creative</strong>
                <span>Content grounded in the business facts and Brand Kit.</span>
              </Link>
              <Link className="k-action-card" to={`/app/sites/${site.id}/today`}>
                <span className="k-overline">Strategy</span>
                <strong>See what Kora recommends next</strong>
                <span>Evidence-led actions, marketing brief and upcoming work.</span>
              </Link>
            </section>

            {rows.length > 1 && (
              <section className="card stack">
                <p className="k-overline">Other websites</p>
                <p className="muted">
                  Kora chose the live or most developed site instead of the most
                  recently created empty draft.
                </p>
                <div className="row">
                  {rows
                    .filter((x) => x.id !== site.id)
                    .slice(0, 5)
                    .map((x) => (
                      <Link key={x.id} className="btn quiet sm" to={`/app/sites/${x.id}`}>
                        {x.name}
                      </Link>
                    ))}
                </div>
              </section>
            )}
          </div>
        );
      }}
    </Async>
  );
}
