/**
 * Deterministic Owner-Mode language. Status headings and sentences come from
 * system state through this table, never from model prose.
 */
const FINDING: Record<string, string> = {
  CONNECTION_REFUSED: "Your website is not accepting connections.",
  DNS_RESOLUTION_FAILURE: "Your website address is not resolving correctly.",
  SERVICE_HTTP_5XX:
    "Your website is reachable, but the application is returning an internal error.",
  SERVICE_HTTP_4XX:
    "Your website is reachable, but it is rejecting the request Kora makes to check it.",
  SERVICE_TIMEOUT: "Your website is taking too long to respond.",
  TLS_HANDSHAKE_FAILURE: "Your website's secure connection (HTTPS) is failing.",
  RESOURCE_REPORTED_STOPPED:
    "The server running your website reports that it is stopped.",
  PROVIDER_UNAVAILABLE:
    "The hosting provider could not be reached to confirm your website's status.",
  RECOVERY_VERIFIED:
    "Your website is working again and Kora has verified the recovery.",
};
const CATEGORY: Record<string, string> = {
  CONNECTION_REFUSED: FINDING.CONNECTION_REFUSED!,
  DNS_FAILURE: FINDING.DNS_RESOLUTION_FAILURE!,
  HTTP_5XX: FINDING.SERVICE_HTTP_5XX!,
  HTTP_4XX: FINDING.SERVICE_HTTP_4XX!,
  TIMEOUT: FINDING.SERVICE_TIMEOUT!,
  TLS_FAILURE: FINDING.TLS_HANDSHAKE_FAILURE!,
};
export const ownerFindingText = (code: string) =>
  FINDING[code] ?? "Kora detected a problem with your website.";
export const ownerCategoryText = (category: string | null) =>
  (category && CATEGORY[category]) ||
  "Your website is not responding to Kora's checks.";

export type OwnerHeadline =
  "ONLINE" | "NEEDS_ATTENTION" | "VERIFYING" | "RECOVERED" | "UNKNOWN";
export interface OwnerStatusInput {
  hasLiveUrl: boolean;
  hasObservations: boolean;
  latestHealthy: boolean | null;
  openIncident: boolean;
  actionState: string | null;
  recoveryVerified: boolean;
}
/** The single status shown on the dashboard card, from durable state only. */
export function ownerHeadline(i: OwnerStatusInput): {
  status: OwnerHeadline;
  title: string;
  detail: string;
} {
  if (
    i.openIncident &&
    (i.actionState === "EXECUTED" || i.actionState === "VERIFYING")
  )
    return {
      status: "VERIFYING",
      title: "Fix applied — verifying",
      detail: "Kora is checking that customers can reach your website again.",
    };
  if (i.openIncident)
    return {
      status: "NEEDS_ATTENTION",
      title: "Needs attention",
      detail: "Kora detected a problem with your website.",
    };
  if (i.recoveryVerified && i.latestHealthy)
    return {
      status: "RECOVERED",
      title: "Website restored",
      detail: "Recovery verified by new observations.",
    };
  if (!i.hasLiveUrl)
    return {
      status: "UNKNOWN",
      title: "Not published yet",
      detail: "Publish your website and Kora will start watching it.",
    };
  if (!i.hasObservations || i.latestHealthy === null)
    return {
      status: "UNKNOWN",
      title: "Checking",
      detail: "Kora has not completed a health check yet.",
    };
  return i.latestHealthy
    ? {
        status: "ONLINE",
        title: "Online",
        detail: "Customers can reach your website.",
      }
    : {
        status: "NEEDS_ATTENTION",
        title: "Needs attention",
        detail:
          "The latest check failed; Kora is confirming before raising an incident.",
      };
}

export const ACTION_OWNER_TEXT: Record<string, string> = {
  run_health_check: "Check your website again",
  restart_service: "Restart the server that runs your website",
  redeploy: "Redeploy your website",
  rollback_deployment: "Restore the previous deployment",
  republish_site_version:
    "Restore the previous healthy version of your website",
};
