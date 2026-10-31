/** M15: motion storyboard from a creative direction. Deterministic scenes the existing renderer can play. */
import type { CreativeDirection } from "./campaign.js";

export interface Scene {
  id: string;
  startSec: number;
  durationSec: number;
  text: string;
  behaviour: "rise" | "fade" | "hold" | "wipe";
}
export interface Storyboard {
  durationSec: number;
  scenes: Scene[];
  reducedMotion: "still-frames";
  captionsNeeded: true;
  silentFirst: true;
}

export function storyboardFor(
  d: CreativeDirection,
  o: { cta: string; detail?: string; durationSec?: number },
): Storyboard {
  const total = Math.min(12, Math.max(4, o.durationSec ?? 7));
  const beats: Array<[string, string, Scene["behaviour"], number]> = [
    ["open", d.headline, "rise", 0.35],
    ...(o.detail
      ? ([["detail", o.detail, "fade", 0.3]] as Array<
          [string, string, Scene["behaviour"], number]
        >)
      : []),
    ["close", o.cta, "hold", o.detail ? 0.35 : 0.65],
  ];
  let t = 0;
  const scenes = beats.map(([id, text, behaviour, share]) => {
    const dur = +(total * share).toFixed(2);
    const s = {
      id,
      startSec: +t.toFixed(2),
      durationSec: dur,
      text,
      behaviour,
    };
    t += dur;
    return s;
  });
  return {
    durationSec: +t.toFixed(2),
    scenes,
    reducedMotion: "still-frames",
    captionsNeeded: true,
    silentFirst: true,
  };
}

export function storyboardIssues(s: Storyboard): string[] {
  const out: string[] = [];
  if (s.scenes[0] && s.scenes[0].durationSec < 1.2)
    out.push("The opening scene is too short to read.");
  for (const sc of s.scenes) {
    const wps = sc.text.split(/\s+/).filter(Boolean).length / sc.durationSec;
    if (wps > 3.5)
      out.push(
        `Scene "${sc.id}" shows ${wps.toFixed(1)} words per second; people read about 3.`,
      );
  }
  if (s.durationSec > 12) out.push("Longer than 12 seconds.");
  return out;
}
