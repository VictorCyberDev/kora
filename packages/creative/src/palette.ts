import type { Colorway, Grammar } from "./grammars.js";

const FEEL_HUE: Array<[RegExp, number]> = [];
void FEEL_HUE;

/**
 * Picks a colourway for a grammar. The seed makes two businesses sharing a grammar land on different colourways;
 * `used` makes the three directions of one brief land on different ones. Dark/light preference follows the feel.
 */
export function distinctColorway(
  g: Grammar,
  seed: number,
  slot: number,
  feel: string,
  used: Colorway[],
): Colorway {
  const wantsDark = /dark|night|moody|dramatic|lounge/i.test(feel);
  const wantsLight = /light|bright|airy|clean|fresh|soft/i.test(feel);
  const list = [...g.colorways];
  const rank = (c: Colorway) => {
    let s = 0;
    if (wantsDark && c.mode === "dark") s += 2;
    if (wantsLight && c.mode === "light") s += 1;
    if (used.some((u) => u.id === c.id)) s -= 3;
    return s;
  };
  const start = Math.abs(seed + slot * 7) % list.length;
  const rotated = [...list.slice(start), ...list.slice(0, start)];
  return rotated.sort((a, b) => rank(b) - rank(a))[0]!;
}
