import type { Colorway, Grammar } from "./grammars.js";

const FEEL_HUE: Array<[RegExp, number]> = [];
void FEEL_HUE;

/**
 * Picks a colourway for a grammar. The seed makes two businesses sharing a grammar land on different colourways;
 * `used` makes the three directions of one brief land on different ones. Dark/light preference follows the feel.
 */
/** Hue in degrees (0-360) and saturation (0-1) of a hex colour. */
function hueSat(hex: string): { h: number; s: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255,
    g = ((n >> 8) & 255) / 255,
    b = (n & 255) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(max + min - 1) || 1) };
}
/**
 * Colour families a kind of business should not wear as its main colour field. Appetite does not live on cold blues
 * and violets; care does not open in alarm red. Applied as a strong penalty, not a ban: an owner who asks for a colour
 * through the feel text still gets it.
 */
const CLUSTER_AVOID: Record<string, (h: number, s: number) => boolean> = {
  food: (h, s) => s > 0.35 && h >= 190 && h <= 290,
  agri: (h, s) => s > 0.35 && h >= 250 && h <= 330,
  health: (h, s) => s > 0.45 && (h >= 345 || h <= 18),
};

export function distinctColorway(
  g: Grammar,
  seed: number,
  slot: number,
  feel: string,
  used: Colorway[],
  cluster = "",
): Colorway {
  const wantsDark = /dark|night|moody|dramatic|lounge/i.test(feel);
  const wantsLight = /light|bright|airy|clean|fresh|soft/i.test(feel);
  const list = [...g.colorways];
  const rank = (c: Colorway) => {
    let s = 0;
    if (wantsDark && c.mode === "dark") s += 2;
    if (wantsLight && c.mode === "light") s += 1;
    if (used.some((u) => u.id === c.id)) s -= 3;
    const avoid = CLUSTER_AVOID[cluster];
    if (avoid) {
      const { h, s: sat } = hueSat(c.primary);
      if (avoid(h, sat) && !/blue|violet|purple|red/i.test(feel)) s -= 6;
    }
    return s;
  };
  const start = Math.abs(seed + slot * 7) % list.length;
  const rotated = [...list.slice(start), ...list.slice(0, start)];
  return rotated.sort((a, b) => rank(b) - rank(a))[0]!;
}
