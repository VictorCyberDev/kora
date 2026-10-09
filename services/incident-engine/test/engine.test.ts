import { describe, expect, it } from "vitest";
import {
  evaluateObservation,
  initialState,
  type EngineState,
  type TelemetryObservation,
} from "../src/index.js";

const serviceId = crypto.randomUUID();
const obs = (healthy: boolean, n: number): TelemetryObservation => ({
  id: crypto.randomUUID(),
  serviceId,
  observedAt: new Date(Date.UTC(2026, 9, 9, 12, 0, n)).toISOString(),
  healthy,
  httpStatus: healthy ? 200 : 503,
  latencyMs: 10 + n,
  timedOut: false,
  failureReason: healthy ? null : "health endpoint returned 503",
  failureCategory: healthy ? null : "http",
});
const cfg = { failureThreshold: 3, recoveryThreshold: 3 };
const step = (state: EngineState, o: TelemetryObservation) =>
  evaluateObservation(state, o, cfg);

describe("incident reliability loop", () => {
  it("healthy checks do not create incidents", () =>
    expect(step(initialState(), obs(true, 1)).effects).toHaveLength(0));
  it("one transient failure does not create an incident", () =>
    expect(step(initialState(), obs(false, 1)).effects).toHaveLength(0));
  it("below-threshold failures do not create an incident", () => {
    let s = initialState();
    s = step(s, obs(false, 1)).state;
    expect(step(s, obs(false, 2)).effects).toHaveLength(0);
  });
  it("threshold creates exactly one incident with triggering evidence and correct start time", () => {
    let s = initialState();
    s = step(s, obs(false, 1)).state;
    s = step(s, obs(false, 2)).state;
    const r = step(s, obs(false, 3));
    expect(r.effects[0]?.type).toBe("incident_created");
    expect(r.state.activeIncident?.evidence).toHaveLength(3);
    expect(r.state.activeIncident?.startedAt).toBe(obs(false, 1).observedAt);
  });
  it("continued failures update the active incident instead of duplicating it", () => {
    let s = initialState();
    for (let i = 1; i <= 3; i++) s = step(s, obs(false, i)).state;
    const r = step(s, obs(false, 4));
    expect(r.effects.map((x) => x.type)).toEqual(["incident_updated"]);
    expect(r.state.activeIncident?.evidence).toHaveLength(4);
  });
  it("too few successes do not resolve and threshold confirms recovery with evidence", () => {
    let s = initialState();
    for (let i = 1; i <= 3; i++) s = step(s, obs(false, i)).state;
    s = step(s, obs(true, 4)).state;
    const second = step(s, obs(true, 5));
    expect(second.effects).toHaveLength(0);
    const third = step(second.state, obs(true, 6));
    expect(third.effects[0]?.type).toBe("recovery_verified");
    if (third.effects[0]?.type === "recovery_verified") {
      expect(third.effects[0].incident.recoveryEvidence).toHaveLength(3);
      expect(third.effects[0].incident.resolvedAt).toBe(
        obs(true, 6).observedAt,
      );
    }
  });
});
