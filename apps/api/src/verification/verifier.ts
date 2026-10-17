import type { FastifyBaseLogger } from "fastify";
import type { KoraStore } from "../store.js";
import { observeWorkloadClaim } from "./claim.js";
import { observeCommitRelation, observeScmHead } from "./scm.js";

interface VerifierOptions {
  store: KoraStore;
  serviceId: string;
  logger: FastifyBaseLogger;
  repo: string;
  branch: string;
  apiUrl: string;
  claimUrl: string;
  timeoutMs: number;
  /** Used for one request header to GitHub; never stored or logged. */
  token?: string | undefined;
  intervalMs?: number;
}

/**
 * Periodically records Deployment Verification (not cryptographic) evidence:
 * the source branch head (GitHub), the workload's runtime claim, and, when
 * they differ, how the two relate. Each check is stored atomically.
 */
export class DeploymentVerifier {
  readonly #token: string | undefined;
  readonly #options: Omit<VerifierOptions, "token">;
  #timer: NodeJS.Timeout | undefined;
  #inFlight: Promise<void> | undefined;

  constructor({ token, ...options }: VerifierOptions) {
    // The token lives only in a private field, so enumerating, serialising or
    // logging this object can never reveal it.
    this.#token = token;
    this.#options = options;
  }

  async checkOnce(): Promise<void> {
    const { repo, apiUrl, timeoutMs } = this.#options;
    const [scm, claim] = await Promise.all([
      observeScmHead({
        apiUrl,
        repo,
        branch: this.#options.branch,
        token: this.#token,
        timeoutMs,
      }),
      observeWorkloadClaim({ url: this.#options.claimUrl, timeoutMs }),
    ]);
    const observations: Array<
      | typeof scm
      | typeof claim
      | Awaited<ReturnType<typeof observeCommitRelation>>
    > = [scm, claim];
    const claimed = claim.claim?.commit ?? null;
    if (scm.sha && claimed && claimed !== scm.sha)
      observations.push(
        await observeCommitRelation({
          apiUrl,
          repo,
          claimedCommit: claimed,
          headSha: scm.sha,
          token: this.#token,
          timeoutMs,
        }),
      );
    const checkId = await this.#options.store.recordVerificationCheck(
      this.#options.serviceId,
      observations,
    );
    this.#options.logger.info(
      {
        checkId,
        serviceId: this.#options.serviceId,
        scm: scm.outcome,
        claim: claim.outcome,
      },
      "deployment verification recorded",
    );
  }

  private runScheduledCheck() {
    if (this.#inFlight) return;
    this.#inFlight = this.checkOnce()
      .catch((err: unknown) =>
        this.#options.logger.error({ err }, "deployment verification failed"),
      )
      .finally(() => {
        this.#inFlight = undefined;
      });
  }
  start() {
    if (this.#timer) return;
    this.runScheduledCheck();
    this.#timer = setInterval(
      () => this.runScheduledCheck(),
      this.#options.intervalMs ?? 30_000,
    );
  }
  async stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#inFlight;
  }
}
