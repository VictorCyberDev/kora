import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { ProviderError, redactSecret, type CloudProvider, type ProviderCapability, type ProviderResource, type ProviderResourceIdentity, type ProviderStatus } from "./index.js";
const execFile = promisify(execFileCb);
export interface RumptyCloudConfig { apiKey: string; workspace: string; region?: string; cliPath?: string; timeoutMs?: number }
interface CommandRunner { (file: string, args: readonly string[], options: { env: NodeJS.ProcessEnv; timeout: number }): Promise<{ stdout: string; stderr: string }>; }
export class RumptyCloudProvider implements CloudProvider {
  readonly id = "rumptycloud";
  // The public CLI documents workspace and VM listing/status. We deliberately do not advertise metrics/logs/remediation until a stable machine-readable interface is verified.
  readonly capabilities: ReadonlySet<ProviderCapability> = new Set(["RESOURCE_DISCOVERY", "RESOURCE_STATUS"]);
  constructor(private readonly config: RumptyCloudConfig, private readonly run: CommandRunner = execFile) {
    if (!config.apiKey || !config.workspace) throw new ProviderError("AUTHENTICATION", "RumptyCloud credentials/workspace are required", false);
  }
  async discoverResources(): Promise<readonly ProviderResource[]> {
    const output = await this.command(["vm", "ls"]);
    return parseVmList(output, this.config.workspace, this.config.region ?? "lagos-1");
  }
  async getResource(identity: ProviderResourceIdentity): Promise<ProviderResource> {
    if (identity.provider !== this.id || identity.account !== this.config.workspace) throw new ProviderError("NOT_FOUND", "resource does not belong to configured provider scope", false);
    const resources = await this.discoverResources();
    const found = resources.find((resource) => resource.identity.providerResourceId === identity.providerResourceId);
    if (!found) throw new ProviderError("NOT_FOUND", "RumptyCloud resource not found", false);
    return found;
  }
  private async command(args: readonly string[]): Promise<string> {
    try {
      const result = await this.run(this.config.cliPath ?? "rumpty", ["--ws", this.config.workspace, ...args], { env: { ...process.env, RUMPTY_API_KEY: this.config.apiKey, RUMPTY_WORKSPACE: this.config.workspace }, timeout: this.config.timeoutMs ?? 10_000 });
      return result.stdout;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "RumptyCloud command failed";
      const message = redactSecret(raw, [this.config.apiKey]);
      if (/timed?\s*out|ETIMEDOUT/i.test(message)) throw new ProviderError("TIMEOUT", "RumptyCloud request timed out", true);
      if (/401|unauthorized|authentication|invalid.*token/i.test(message)) throw new ProviderError("AUTHENTICATION", "RumptyCloud authentication failed", false, 401);
      if (/429|rate.?limit/i.test(message)) throw new ProviderError("RATE_LIMITED", "RumptyCloud rate limit reached", true, 429);
      if (/ENOTFOUND|ECONNREFUSED|network/i.test(message)) throw new ProviderError("NETWORK", "RumptyCloud network request failed", true);
      throw new ProviderError("UNAVAILABLE", "RumptyCloud provider unavailable", true);
    }
  }
}
function normalizeStatus(value: string): ProviderStatus {
  const status = value.toLowerCase();
  if (["running", "active", "ready"].includes(status)) return "running";
  if (["stopped", "off", "powered-off"].includes(status)) return "stopped";
  if (["creating", "provisioning", "starting", "stopping"].includes(status)) return "provisioning";
  if (["failed", "error"].includes(status)) return "failed";
  return "unknown";
}
export function parseVmList(output: string, workspace: string, region: string): ProviderResource[] {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(/\s{2,}|\t/).map((x) => x.trim().toLowerCase());
  const idIndex = header.findIndex((x) => x === "id" || x.includes("vm id"));
  const nameIndex = header.findIndex((x) => x === "name" || x.includes("vm"));
  const statusIndex = header.findIndex((x) => x === "status" || x === "state");
  if (idIndex < 0 || statusIndex < 0) throw new ProviderError("MALFORMED_RESPONSE", "RumptyCloud VM list did not contain stable ID/status columns", false);
  return lines.slice(1).map((line) => {
    const cells = line.split(/\s{2,}|\t/).map((x) => x.trim());
    const providerResourceId = cells[idIndex];
    if (!providerResourceId) throw new ProviderError("MALFORMED_RESPONSE", "RumptyCloud VM row did not contain a resource ID", false);
    return { identity: { provider: "rumptycloud", account: workspace, region, resourceType: "virtual_machine", providerResourceId }, displayName: nameIndex >= 0 ? cells[nameIndex] ?? null : null, status: normalizeStatus(cells[statusIndex] ?? "unknown"), metadata: {} };
  });
}
