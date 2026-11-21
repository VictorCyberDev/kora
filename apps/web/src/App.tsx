import {
  KrevLanding as Landing,
  KrevMarketingPage,
  KrevMarketingNav,
} from "./pages/krev-marketing";
import { PublicAuditPage, SharedAuditPage } from "./pages/audit";
import { lazy, Suspense, useEffect, useState } from "react";
import type { ComponentType } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api } from "./api";
import { useAuth } from "./auth";
import { Logo, Spinner, useLoad } from "./ui";
import { Login, Pricing, Privacy, Signup, Terms } from "./pages/public";

function lazyPage<T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) {
  return lazy(async () => ({
    default: (await loader())[name] as ComponentType,
  }));
}

const KrevWorkspaceEntry = lazy(() =>
  import("./pages/krev-workspace-entry").then((module) => ({
    default: module.KrevWorkspaceEntry,
  })),
);
const KrevCreativeStudio = lazyPage(
  () => import("./pages/krev-creative-studio"),
  "KrevCreativeStudio",
);
const IdentityPage = lazyPage(() => import("./pages/identity"), "IdentityPage");
const ImagesPage = lazyPage(() => import("./pages/creative"), "ImagesPage");
const SitesList = lazyPage(() => import("./pages/sites"), "SitesList");
const NewSiteV6 = lazyPage(() => import("./pages/new-site-v6"), "NewSiteV6");
const Dashboard = lazyPage(() => import("./pages/dashboard-v3"), "Dashboard");
const Build = lazyPage(() => import("./pages/build"), "Build");
const WebsiteStudio = lazyPage(
  () => import("./pages/website-studio"),
  "WebsiteStudio",
);
const MemoryPage = lazyPage(() => import("./pages/intel"), "MemoryPage");
const ResultsPage = lazyPage(() => import("./pages/intel"), "ResultsPage");
const ReviewsPage = lazyPage(() => import("./pages/intel"), "ReviewsPage");
const CampaignsPage = lazyPage(() => import("./pages/today"), "CampaignsPage");
const TodayPage = lazyPage(() => import("./pages/today"), "TodayPage");
const CalendarPage = lazyPage(() => import("./pages/calendar"), "CalendarPage");
const StudioPage = lazyPage(() => import("./pages/studio"), "StudioPage");
const ChannelsPage = lazyPage(() => import("./pages/channels"), "ChannelsPage");
const AgencyPage = lazyPage(() => import("./pages/agency"), "AgencyPage");
const CustomersPage = lazyPage(
  () => import("./pages/customers"),
  "CustomersPage",
);
const BrandPage = lazyPage(() => import("./pages/presence"), "BrandPage");
const PresencePage = lazyPage(() => import("./pages/presence"), "PresencePage");
const CampaignsEntryV6 = lazyPage(
  () => import("./pages/site-entry-v6"),
  "CampaignsEntryV6",
);
const CustomersEntryV6 = lazyPage(
  () => import("./pages/site-entry-v6"),
  "CustomersEntryV6",
);
const ImagesEntryV6 = lazyPage(
  () => import("./pages/site-entry-v6"),
  "ImagesEntryV6",
);
const MarketingEntryV6 = lazyPage(
  () => import("./pages/site-entry-v6"),
  "MarketingEntryV6",
);
const PresenceEntryV6 = lazyPage(
  () => import("./pages/site-entry-v6"),
  "PresenceEntryV6",
);
const IncidentPage = lazyPage(() => import("./pages/incident"), "IncidentPage");
const IncidentsList = lazyPage(
  () => import("./pages/incident"),
  "IncidentsList",
);
const AuditPage = lazyPage(() => import("./pages/more"), "AuditPage");
const BillingPage = lazyPage(() => import("./pages/more"), "BillingPage");
const DeploymentsPage = lazyPage(
  () => import("./pages/more"),
  "DeploymentsPage",
);
const DomainsPage = lazyPage(() => import("./pages/more"), "DomainsPage");
const FormsPage = lazyPage(() => import("./pages/more"), "FormsPage");
const OperationsPage = lazyPage(() => import("./pages/more"), "OperationsPage");
const SettingsPage = lazyPage(() => import("./pages/more"), "SettingsPage");
const SiteSettings = lazyPage(() => import("./pages/more"), "SiteSettings");
const SiteShell = lazyPage(() => import("./pages/more"), "SiteShell");
const SiteOverview = lazyPage(() => import("./pages/more"), "SiteOverview");

function PublicLayout() {
  const { user } = useAuth();
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <div className="wrap">
          <Logo />
          <details className="krev-public-menu">
            <summary>Menu</summary>
            <div className="krev-public-menu-panel">
              <KrevMarketingNav />
              <nav aria-label="Mobile public navigation">
                <NavLink to="/audit">Free website check</NavLink>
                <NavLink to="/pricing">Pricing</NavLink>
                {user ? (
                  <Link to="/app">Open Mission Control</Link>
                ) : (
                  <>
                    <Link to="/login">Sign in</Link>
                    <Link to="/signup">Start creating</Link>
                  </>
                )}
              </nav>
            </div>
          </details>
          <KrevMarketingNav />
          <nav className="main" aria-label="Public">
            <NavLink to="/audit">Free website check</NavLink>
            <NavLink to="/pricing">Pricing</NavLink>
          </nav>
          {user ? (
            <Link className="btn sm" to="/app">
              Open Mission Control
            </Link>
          ) : (
            <>
              <Link className="btn sm ghost" to="/login">
                Sign in
              </Link>
              <Link className="btn sm" to="/signup">
                Start creating
              </Link>
            </>
          )}
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site">
        <div className="wrap row between">
          <span>
            © Krevstudio. Create your brand and everything that follows.
          </span>
          <span className="row">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </span>
        </div>
      </footer>
    </>
  );
}

function Bell() {
  const n = useLoad(() => api("GET", "/api/notifications"), [], 15000);
  const [open, setOpen] = useState(false);
  const unread = (n.data ?? []).filter((x: { read: boolean }) => !x.read);
  return (
    <div style={{ position: "relative" }}>
      <button
        className="btn quiet sm"
        aria-expanded={open}
        aria-label={`Notifications, ${unread.length} unread`}
        onClick={() => setOpen(!open)}
      >
        <span className="lbl">Notifications</span>
        <svg
          className="bell-ico"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread.length ? <span className="count">{unread.length}</span> : null}
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: 44,
            width: "min(360px, 90vw)",
            zIndex: 30,
            maxHeight: 420,
            overflow: "auto",
          }}
        >
          {(n.data ?? []).length === 0 && (
            <p className="muted">
              Nothing yet. Krevstudio will tell you here when something needs
              you.
            </p>
          )}
          {(n.data ?? [])
            .slice(0, 12)
            .map(
              (x: {
                id: string;
                title: string;
                body: string;
                read: boolean;
                kind: string;
                objectType: string | null;
                objectId: string | null;
                siteId: string | null;
              }) => (
                <div
                  key={x.id}
                  style={{
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)",
                    opacity: x.read ? 0.6 : 1,
                  }}
                >
                  <strong>{x.title}</strong>
                  <div className="small muted">{x.body}</div>
                  <div className="row">
                    {x.siteId && x.objectType === "incident" && (
                      <Link
                        className="small"
                        to={`/app/sites/${x.siteId}/incidents/${x.objectId}`}
                        onClick={() => setOpen(false)}
                      >
                        Open
                      </Link>
                    )}
                    {!x.read && (
                      <button
                        className="btn sm quiet"
                        onClick={async () => {
                          await api("POST", `/api/notifications/${x.id}/read`);
                          n.reload();
                        }}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              ),
            )}
        </div>
      )}
    </div>
  );
}

function AppLayout() {
  const { user, ready, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [proof, setProof] = useState(
    () => localStorage.getItem("kora.mode") === "proof",
  );
  useEffect(() => {
    localStorage.setItem("kora.mode", proof ? "proof" : "owner");
    window.dispatchEvent(new Event("kora-mode"));
  }, [proof]);
  if (!ready)
    return (
      <div className="wrap" style={{ padding: 40 }}>
        <Spinner />
      </div>
    );
  if (!user)
    return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <div className="wrap">
          <Logo />
          <nav className="main" aria-label="Mission Control">
            <NavLink to="/app" end>
              Home
            </NavLink>
            <NavLink to="/app/create">Create</NavLink>
            <NavLink to="/app/sites">Websites</NavLink>
            <NavLink to="/app/designs">Designs</NavLink>
            <NavLink to="/app/brand">Logo & Brand</NavLink>
            <NavLink to="/app/assets">Assets</NavLink>
            <NavLink to="/app/customers">Customers</NavLink>
            <NavLink to="/app/campaigns">Campaigns</NavLink>
            <NavLink to="/app/publish">Publish</NavLink>
            <NavLink to="/app/operations">Health</NavLink>
            <NavLink
              to="/app/more"
              className={() =>
                /^\/app\/(more|sites|billing|audit|settings)(\/|$)/.test(
                  loc.pathname,
                ) &&
                !/^\/app\/sites\/[^/]+\/(presence|brand|channels|customers|create|calendar|incidents|deployments|domains)/.test(
                  loc.pathname,
                )
                  ? "active"
                  : ""
              }
            >
              More
            </NavLink>
            <button
              className="navlink-btn"
              onClick={async () => {
                await logout();
                nav("/");
              }}
            >
              Sign out
            </button>
          </nav>
          <div className="seg" role="group" aria-label="View mode">
            <button aria-pressed={!proof} onClick={() => setProof(false)}>
              Owner
            </button>
            <button aria-pressed={proof} onClick={() => setProof(true)}>
              Proof
            </button>
          </div>
          <Bell />
          <button
            className="btn quiet sm signout"
            onClick={async () => {
              await logout();
              nav("/");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="wrap" style={{ paddingBlock: 28 }}>
        <Outlet context={{ proof }} />
      </main>
    </>
  );
}

function MorePage() {
  const items: Array<[string, string, string]> = [
    ["/app/sites", "Websites", "All your websites, and create a new one"],
    [
      "/app/billing",
      "Billing",
      "Your plan, payments and what each plan includes",
    ],
    [
      "/app/audit",
      "Activity",
      "A record of what was changed, by whom, and when",
    ],
    ["/app/settings", "Settings", "Your account, team and notifications"],
    [
      "/app/agency",
      "Agency workspace",
      "Clients, reviews and controlled delivery",
    ],
  ];
  return (
    <div className="stack">
      <section className="card stack">
        <p className="k-overline">More</p>
        <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Everything else</h1>
      </section>
      <ul className="k-checks">
        {items.map(([to, title, detail]) => (
          <li key={to} className="k-check">
            <NavLink to={to} className="k-lead">
              <strong>{title}</strong>
              <span className="muted">{detail}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  return (
    <Suspense
      fallback={
        <div className="wrap" style={{ padding: 40 }} role="status">
          <Spinner /> Loading workspace…
        </div>
      }
    >
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/product/:topic" element={<KrevMarketingPage />} />
          <Route path="/audit" element={<PublicAuditPage />} />
          <Route path="/audit/shared" element={<SharedAuditPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
        </Route>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="create" element={<KrevWorkspaceEntry mode="create" />} />
          <Route
            path="designs"
            element={<KrevWorkspaceEntry mode="designs" />}
          />
          <Route path="brand" element={<KrevWorkspaceEntry mode="brand" />} />
          <Route path="assets" element={<KrevWorkspaceEntry mode="assets" />} />
          <Route
            path="publish"
            element={<KrevWorkspaceEntry mode="publish" />}
          />
          <Route path="sites" element={<SitesList />} />
          <Route path="sites/new" element={<NewSiteV6 />} />
          <Route path="sites/:id" element={<SiteShell />}>
            <Route index element={<SiteOverview />} />
            <Route path="presence" element={<PresencePage />} />
            <Route path="brand" element={<BrandPage />} />
            <Route path="identity" element={<IdentityPage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="campaigns" element={<CampaignsPage />} />
            <Route path="create" element={<StudioPage />} />
            <Route path="images" element={<ImagesPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="channels" element={<ChannelsPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="build" element={<Build />} />
            <Route path="website-studio" element={<WebsiteStudio />} />
            <Route path="creative-studio" element={<KrevCreativeStudio />} />
            <Route path="deployments" element={<DeploymentsPage />} />
            <Route path="incidents" element={<IncidentsList />} />
            <Route path="incidents/:incidentId" element={<IncidentPage />} />
            <Route path="domains" element={<DomainsPage />} />
            <Route path="forms" element={<FormsPage />} />
            <Route path="settings" element={<SiteSettings />} />
          </Route>
          <Route path="presence" element={<PresenceEntryV6 />} />
          <Route path="customers" element={<CustomersEntryV6 />} />
          <Route path="marketing" element={<MarketingEntryV6 />} />
          <Route path="campaigns" element={<CampaignsEntryV6 />} />
          <Route path="images" element={<ImagesEntryV6 />} />
          <Route path="more" element={<MorePage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="agency" element={<AgencyPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="wrap" style={{ padding: 60 }}>
              <h1>Page not found</h1>
              <Link to="/">Go home</Link>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
