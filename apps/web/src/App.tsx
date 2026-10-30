import { useEffect, useState } from "react";
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
import {
  Landing,
  Login,
  Pricing,
  Privacy,
  Signup,
  Terms,
} from "./pages/public";
import { NewSite, SitesList } from "./pages/sites";
import { Dashboard } from "./pages/dashboard-v3";
import { Build } from "./pages/build";
import { IncidentPage, IncidentsList } from "./pages/incident";
import {
  AuditPage,
  BillingPage,
  DeploymentsPage,
  DomainsPage,
  FormsPage,
  OperationsPage,
  SettingsPage,
  SiteSettings,
  SiteShell,
  SiteOverview,
} from "./pages/more";

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
          <nav className="main" aria-label="Public">
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
                Build my website
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
          <span>© Kora. Build it. Launch it. Keep it running.</span>
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
              Nothing yet. Kora will tell you here when something needs you.
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
              Overview
            </NavLink>
            <NavLink to="/app/sites">Websites</NavLink>
            <NavLink to="/app/operations">Operations</NavLink>
            <NavLink to="/app/billing">Billing</NavLink>
            <NavLink to="/app/audit">Activity</NavLink>
            <NavLink to="/app/settings">Settings</NavLink>
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

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
      </Route>
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="sites" element={<SitesList />} />
        <Route path="sites/new" element={<NewSite />} />
        <Route path="sites/:id" element={<SiteShell />}>
          <Route index element={<SiteOverview />} />
          <Route path="build" element={<Build />} />
          <Route path="deployments" element={<DeploymentsPage />} />
          <Route path="incidents" element={<IncidentsList />} />
          <Route path="incidents/:incidentId" element={<IncidentPage />} />
          <Route path="domains" element={<DomainsPage />} />
          <Route path="forms" element={<FormsPage />} />
          <Route path="settings" element={<SiteSettings />} />
        </Route>
        <Route path="operations" element={<OperationsPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="settings" element={<SettingsPage />} />
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
  );
}
