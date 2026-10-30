import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ApiError, type J } from "./api";

type Kind = "ok" | "warn" | "bad" | "info" | "wait";
const PATHS: Record<Kind, ReactNode> = {
  ok: <path d="M20 6 9 17l-5-5" />,
  warn: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </>
  ),
  bad: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v5h1" />
    </>
  ),
  wait: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
};
export function Icon({ kind }: { kind: Kind }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[kind]}
    </svg>
  );
}
/** Status is always label + icon + colour, never colour alone. */
export function Status({
  kind,
  children,
}: {
  kind: Kind;
  children: ReactNode;
}) {
  return (
    <span className={`status ${kind}`}>
      <Icon kind={kind} />
      {children}
    </span>
  );
}
export const kindFor = (s: string): Kind =>
  (({
    ONLINE: "ok",
    RECOVERED: "ok",
    NEEDS_ATTENTION: "bad",
    VERIFYING: "info",
    UNKNOWN: "wait",
  })[s] as Kind) ?? "wait";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Kora home">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill="var(--brand)" />
        <circle
          cx="32"
          cy="32"
          r="14"
          fill="none"
          stroke="var(--brand-ink)"
          strokeWidth="5"
        />
        <circle cx="32" cy="32" r="4.5" fill="var(--brand-ink)" />
      </svg>
      kora
    </Link>
  );
}
export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <span className="row" role="status">
    <span className="spinner" aria-hidden="true" />
    <span className="muted">{label}…</span>
  </span>
);
export function Notice({
  kind = "info",
  children,
}: {
  kind?: "info" | "warn" | "bad" | "ok";
  children: ReactNode;
}) {
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "bad" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
export const Empty = ({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) => (
  <div className="card flat" style={{ textAlign: "center", padding: 32 }}>
    <h3>{title}</h3>
    <div className="muted">{children}</div>
  </div>
);
export const errText = (e: unknown) =>
  e instanceof ApiError ? e.message : "Something went wrong. Please try again.";

/** Loads data with explicit loading and error states; `reload` refreshes. */
export function useLoad<T = J>(
  load: () => Promise<T>,
  deps: unknown[] = [],
  every?: number,
) {
  const [state, set] = useState<{
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && set({ data, error: null, loading: false }),
      (e: unknown) =>
        alive &&
        set((p) => ({ data: p.data, error: errText(e), loading: false })),
    );
    return () => {
      alive = false;
    };
  }, [...deps, tick]);
  useEffect(() => {
    if (!every) return;
    const t = setInterval(() => setTick((n) => n + 1), every);
    return () => clearInterval(t);
  }, [every]);
  return { ...state, reload: () => setTick((n) => n + 1) };
}
export function Async<T>({
  state,
  children,
}: {
  state: { data: T | null; error: string | null; loading: boolean };
  children: (d: T) => ReactNode;
}) {
  if (state.data) return <>{children(state.data)}</>;
  if (state.error) return <Notice kind="bad">{state.error}</Notice>;
  return <Spinner />;
}
export function Tabs({ items }: { items: Array<[string, string]> }) {
  return (
    <nav className="tabs" aria-label="Site sections">
      {items.map(([to, label]) => (
        <NavLink key={to} to={to} end>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
