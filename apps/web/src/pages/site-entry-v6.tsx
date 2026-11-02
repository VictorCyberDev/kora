import { Link, Navigate } from "react-router-dom";
import { api, type J } from "../api";
import { Async, Empty, useLoad } from "../ui";

function preferredSite(rows: J[]) {
  return (
    rows.find((site) => site.status === "PUBLISHED" && site.publicUrl) ??
    rows.find((site) => site.publishedVersionId) ??
    rows.find((site) => site.currentVersionId) ??
    rows[0]
  );
}

function SiteEntry({
  destination,
  emptyTitle,
  emptyCopy,
}: {
  destination: string;
  emptyTitle: string;
  emptyCopy: string;
}) {
  const sites = useLoad<J[]>(() => api("GET", "/api/sites"), []);
  return (
    <Async state={sites}>
      {(rows) => {
        const site = preferredSite(rows);
        return site ? (
          <Navigate to={`/app/sites/${site.id}/${destination}`} replace />
        ) : (
          <Empty title={emptyTitle}>
            {emptyCopy}
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

export function PresenceEntryV6() {
  return (
    <SiteEntry
      destination="presence"
      emptyTitle="No business profile yet"
      emptyCopy="Presence starts from your business. Create a website once, then keep its details, brand and channels here."
    />
  );
}

export function CustomersEntryV6() {
  return (
    <SiteEntry
      destination="customers"
      emptyTitle="No customers yet"
      emptyCopy="Customers are attached to a business website. Create your first website to start capturing enquiries."
    />
  );
}

export function MarketingEntryV6() {
  return (
    <SiteEntry
      destination="today"
      emptyTitle="Nothing to market yet"
      emptyCopy="Create your first business website once. After that, Campaigns, Images and Studio always attach to that existing business instead of asking you to start again."
    />
  );
}

export function CampaignsEntryV6() {
  return (
    <SiteEntry
      destination="campaigns"
      emptyTitle="Nothing to campaign yet"
      emptyCopy="Create your first business website, then build campaigns for it from here."
    />
  );
}

export function ImagesEntryV6() {
  return (
    <SiteEntry
      destination="images"
      emptyTitle="Nothing to create for yet"
      emptyCopy="Create your first business website, then make images for that existing business from here."
    />
  );
}
