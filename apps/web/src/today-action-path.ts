/** Owner-visible Today links use explicit routes, never arbitrary server strings. */
const SITE_ROUTES = new Set([
  "customers",
  "channels",
  "presence",
  "calendar",
  "campaigns",
  "identity",
  "build",
  "brand",
  "create",
  "website-studio",
  "creative-studio",
  "results",
  "memory",
]);
export function todayActionPath(siteId: string, target: string): string {
  if (target === "health") return "/app/operations";
  if (target === "audit") return "/app/audit";
  if (SITE_ROUTES.has(target))
    return `/app/sites/${encodeURIComponent(siteId)}/${target}`;
  return `/app/sites/${encodeURIComponent(siteId)}/today`;
}
