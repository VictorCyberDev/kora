import {
  CHANNEL_PROVIDERS,
  type ChannelProvider,
  type ConnectionState,
} from "./graph.js";

export const CAPABILITIES = [
  "publish",
  "schedule",
  "analytics",
  "messages",
  "profile",
  "reviews",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
/** `limited` means it works with a stated restriction; `unsupported` means Kora will not pretend. */
export type Support = "supported" | "limited" | "unsupported";

export interface ChannelSpec {
  label: string;
  family: "meta" | "google" | "tiktok" | "linkedin";
  capabilities: Record<Capability, Support>;
  /** Plain-language limits shown to the owner next to the capability. */
  notes: string[];
  /** Server environment variables the OAuth app needs. Missing ones mean NOT_CONFIGURED at runtime. */
  requiredEnv: string[];
  /** Approval the platform itself requires before Kora can use a capability in production. */
  platformApproval: string | null;
  /** Whether Kora can connect this provider today. */
  availability: "available" | "planned";
}

const caps = (
  o: Partial<Record<Capability, Support>>,
): Record<Capability, Support> => ({
  publish: "unsupported",
  schedule: "unsupported",
  analytics: "unsupported",
  messages: "unsupported",
  profile: "unsupported",
  reviews: "unsupported",
  ...o,
});

const META_ENV = ["META_APP_ID", "META_APP_SECRET"];
const GOOGLE_ENV = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"];

/** The capability matrix is data, so UI, API guards and tests all read the same truth. */
export const CHANNEL_MATRIX: Record<ChannelProvider, ChannelSpec> = {
  instagram: {
    label: "Instagram",
    family: "meta",
    capabilities: caps({
      publish: "supported",
      schedule: "limited",
      analytics: "supported",
      messages: "limited",
      profile: "limited",
    }),
    notes: [
      "Needs an Instagram professional account linked to a Facebook Page.",
      "Instagram has no native scheduling here: Kora holds the post and publishes it at the time you chose.",
      "Stories and reels follow Instagram's own format rules.",
    ],
    requiredEnv: META_ENV,
    platformApproval: "Meta app review for content publishing and messaging.",
    availability: "available",
  },
  facebook: {
    label: "Facebook Page",
    family: "meta",
    capabilities: caps({
      publish: "supported",
      schedule: "supported",
      analytics: "supported",
      messages: "limited",
      profile: "limited",
      reviews: "limited",
    }),
    notes: [
      "Works with Facebook Pages, not personal profiles.",
      "Reading reviews is supported; replying is limited by Meta.",
    ],
    requiredEnv: META_ENV,
    platformApproval: "Meta app review for Page publishing and messaging.",
    availability: "available",
  },
  whatsapp: {
    label: "WhatsApp Business",
    family: "meta",
    capabilities: caps({
      messages: "supported",
      profile: "supported",
      analytics: "limited",
    }),
    notes: [
      "Customers must message you first or opt in. Outside 24 hours of their last message, only approved templates can be sent.",
      "WhatsApp Status cannot be posted automatically, so Kora does not offer it.",
      "No bulk or unsolicited messaging.",
    ],
    requiredEnv: [...META_ENV, "WHATSAPP_VERIFY_TOKEN"],
    platformApproval:
      "WhatsApp Business Platform onboarding and approved message templates.",
    availability: "available",
  },
  google_business: {
    label: "Google Business Profile",
    family: "google",
    capabilities: caps({
      publish: "limited",
      analytics: "supported",
      profile: "supported",
      reviews: "supported",
    }),
    notes: [
      "Kora can keep your hours, phone and description in step with your website.",
      "Posts are limited to Google's local post types.",
    ],
    requiredEnv: GOOGLE_ENV,
    platformApproval: "Google Business Profile API access approval.",
    availability: "available",
  },
  search_console: {
    label: "Google Search Console",
    family: "google",
    capabilities: caps({ analytics: "supported" }),
    notes: ["Read-only: shows how your website appears in Google search."],
    requiredEnv: GOOGLE_ENV,
    platformApproval: null,
    availability: "available",
  },
  tiktok: {
    label: "TikTok",
    family: "tiktok",
    capabilities: caps({ publish: "limited", analytics: "limited" }),
    notes: [
      "Public posting through the API needs TikTok's audit. Until then Kora prepares the video and caption for you to post from the app.",
    ],
    requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    platformApproval: "TikTok Content Posting API audit.",
    availability: "available",
  },
  linkedin: {
    label: "LinkedIn",
    family: "linkedin",
    capabilities: caps({}),
    notes: ["Planned. Not available yet."],
    requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    platformApproval: "LinkedIn Marketing/Community API access.",
    availability: "planned",
  },
};

export const supports = (p: ChannelProvider, c: Capability): boolean =>
  CHANNEL_MATRIX[p].capabilities[c] !== "unsupported";

export type RuntimeState = "CONFIGURED" | "NOT_CONFIGURED" | "SANDBOX";
export interface RuntimeStatus {
  provider: ChannelProvider;
  state: RuntimeState;
  missing: string[];
}
/** Whether this deployment holds the credentials to connect a provider. Never reports a value, only names. */
export function runtimeStatus(
  provider: ChannelProvider,
  env: Record<string, string | undefined>,
): RuntimeStatus {
  const spec = CHANNEL_MATRIX[provider];
  const missing = spec.requiredEnv.filter((k) => !env[k]);
  return {
    provider,
    state:
      spec.availability === "planned" || missing.length
        ? "NOT_CONFIGURED"
        : "CONFIGURED",
    missing: spec.availability === "planned" ? spec.requiredEnv : missing,
  };
}

export interface ConnectionObservation {
  tokenExpiresAt: Date | null;
  /** Result of the most recent provider call, if any. */
  lastCall:
    { ok: true } | { ok: false; httpStatus: number; code?: string } | null;
  grantedScopes: string[];
  requiredScopes: string[];
  now: Date;
  revoked: boolean;
}

/** Maps what Kora observed about a connection to its state. The one place that decides a connection's health. */
export function deriveConnectionState(
  o: ConnectionObservation,
): ConnectionState {
  if (o.revoked) return "DISCONNECTED";
  if (o.tokenExpiresAt && o.tokenExpiresAt.getTime() <= o.now.getTime())
    return "AUTH_EXPIRED";
  if (o.requiredScopes.some((s) => !o.grantedScopes.includes(s)))
    return "PERMISSION_REQUIRED";
  if (o.lastCall && !o.lastCall.ok) {
    const c = o.lastCall;
    if (c.httpStatus === 401 || c.code === "token_expired")
      return "AUTH_EXPIRED";
    if (c.httpStatus === 403) return "PERMISSION_REQUIRED";
    if (c.httpStatus === 429) return "RATE_LIMITED";
    return "DEGRADED";
  }
  return "CONNECTED";
}

export const CHANNEL_LIST = CHANNEL_PROVIDERS;
