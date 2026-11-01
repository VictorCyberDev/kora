import { Link } from "react-router-dom";
import { api, type J } from "../api";
import { useAuth } from "../auth";
import { Async, Empty, LevelLine, Status, useLoad } from "../ui";
import { SiteStatusCard } from "./sites";

function QuickAction({
  to,
  eyebrow,
  title,
  detail,
}: {
  to: string;
  eyebrow: string;
  title: string;
  detail: string;
}) {
  return (
    <Link className="k-quick" to={to}>
      <span className="k-quick-kicker">{eyebrow}</span>
      <strong>{title}</strong>
      <span>{detail}</span>
      <span className="k-quick-arrow" aria-hidden="true">
        ↗
      </span>
    </Link>
  );
}

const preferredSite = (rows: J[]) =>
  rows.find((site) => site.status === "PUBLISHED" && site.publicUrl) ??
  rows.find((site) => site.publishedVersionId) ??
  rows.find((site) => site.currentVersionId) ??
  rows[0];

export function Dashboard() {
  const { user } = useAuth();
  const sites = useLoad<J[]>(() => api("GET", "/api/sites"));
  const primarySite = sites.data?.length ? preferredSite(sites.data) : undefined;
  const primarySiteId = primarySite?.id as string | undefined;
  const waiting = useLoad(
    () =>
      primarySiteId
        ? api<J>("GET", `/api/sites/${primarySiteId}/customers/summary`)
        : Promise.resolve(null),
    [primarySiteId],
    primarySiteId ? 15000 : undefined,
  );
  return (
    <div className="k-home stack">
      <header className="k-home-head">
        <div>
          <p className="k-overline">Your business, online</p>
          <h1>
            Good to see you, {user?.displayName?.split(" ")[0] ?? "there"}.
          </h1>
          <p className="muted">
            One place to build your presence, see what needs you, and keep
            customers able to reach you.
          </p>
        </div>
        <Link className="btn" to="/app/sites/new">
          New website
        </Link>
      </header>

      <Async state={sites}>
        {(rows) => {
          if (rows.length === 0)
            return (
              <Empty title="Put your business online">
                Give Kora the business name and two lines about what you do. You
                will get three directions to choose from, then Kora keeps watching
                after launch.
                <p>
                  <Link className="btn" to="/app/sites/new">
                    Create my first website
                  </Link>
                </p>
              </Empty>
            );

          const site = preferredSite(rows);
          return (
            <>
              <section className="k-home-status" aria-labelledby="business-now">
                <div className="k-section-head">
                  <div>
                    <p className="k-overline">Right now</p>
                    <h2 id="business-now">Can customers reach you?</h2>
                  </div>
                  {site.publicUrl ? (
                    <a
                      className="btn quiet sm"
                      href={site.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View live site
                    </a>
                  ) : null}
                </div>
                <SiteStatusCard siteId={site.id} />
              </section>

              <section aria-labelledby="quick-actions">
                <div className="k-section-head">
                  <div>
                    <p className="k-overline">Do the next thing</p>
                    <h2 id="quick-actions">Quick actions</h2>
                  </div>
                </div>
                <div className="k-quick-grid">
                  <QuickAction
                    to={`/app/sites/${site.id}/build`}
                    eyebrow="Website"
                    title="Edit what customers see"
                    detail="Design, copy, sections and versions"
                  />
                  <QuickAction
                    to="/app/campaigns"
                    eyebrow="Marketing"
                    title="Create a campaign"
                    detail="Use the business you already published — no new website needed"
                  />
                  <QuickAction
                    to="/app/images"
                    eyebrow="Studio"
                    title="Create campaign images"
                    detail="Make and review visuals for your existing business"
                  />
                  <QuickAction
                    to={`/app/sites/${site.id}/customers`}
                    eyebrow="Customers"
                    title={
                      waiting.data
                        ? waiting.data.waiting === 0
                          ? "Nobody is waiting for a reply"
                          : `${waiting.data.waiting} customer${waiting.data.waiting === 1 ? " is" : "s are"} waiting for a reply`
                        : "Your customers"
                    }
                    detail="Enquiries from your website and channels, in one place"
                  />
                  <QuickAction
                    to={`/app/sites/${site.id}/presence`}
                    eyebrow="Presence"
                    title="Business details and health"
                    detail="What customers see about you, and what could be better"
                  />
                  <QuickAction
                    to={`/app/sites/${site.id}/domains`}
                    eyebrow="Presence"
                    title="Your domain"
                    detail="Connect the address customers should remember"
                  />
                  <QuickAction
                    to="/app/operations"
                    eyebrow="Health"
                    title="See what Kora is watching"
                    detail="Incidents, recovery and operational proof"
                  />
                </div>
              </section>

              <section className="k-home-grid" aria-label="Kora overview">
                <div className="k-panel k-panel-ink">
                  <div className="row between">
                    <p className="k-overline">Kora signal</p>
                    <Status kind="ok">Watching</Status>
                  </div>
                  <h2>
                    Quiet when everything is fine. Specific when it is not.
                  </h2>
                  <p>
                    Kora watches the live site, keeps the evidence, and asks
                    before a fix changes what customers see. A repair only
                    counts after new checks pass.
                  </p>
                  <LevelLine state="steady" />
                  <Link className="k-text-link" to="/app/operations">
                    Open health and recovery →
                  </Link>
                </div>

                <div className="k-panel">
                  <p className="k-overline">Your presence</p>
                  <h2>
                    {rows.length === 1
                      ? "1 website"
                      : `${rows.length} websites`}
                  </h2>
                  <p className="muted">
                    Keep the public details people use to find and contact your
                    business current in one place.
                  </p>
                  <div className="k-presence-list">
                    {rows.slice(0, 4).map((row) => (
                      <Link key={row.id} to={`/app/sites/${row.id}`}>
                        <span>{row.name}</span>
                        <span className="small muted">
                          {row.publicUrl ? "Live" : "Draft"}
                        </span>
                      </Link>
                    ))}
                  </div>
                  <Link className="k-text-link" to="/app/sites">
                    Manage websites →
                  </Link>
                </div>
              </section>
            </>
          );
        }}
      </Async>
    </div>
  );
}
