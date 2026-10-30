/** Outbound email contract. In-app notifications never depend on it. */
export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}
/** Used when no email transport is configured: refuses to pretend a message was sent. */
export const noEmailProvider: EmailProvider = {
  name: "none",
  configured: false,
  send: () =>
    Promise.reject(
      new Error("No email provider is configured; the message was not sent."),
    ),
};
export function describeChannels(email: EmailProvider) {
  return {
    inApp: { available: true },
    email: email.configured
      ? { available: true, provider: email.name }
      : {
          available: false,
          reason:
            "Email delivery is not configured on this Kora. Notifications appear in the app.",
        },
  };
}
