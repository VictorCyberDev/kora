import { describe, it, expect } from "vitest";
import { bundleSvgZip } from "./creative-zip";
const read32 = (a: Uint8Array, i: number) =>
  new DataView(a.buffer, a.byteOffset, a.byteLength).getUint32(i, true);
const read16 = (a: Uint8Array, i: number) =>
  new DataView(a.buffer, a.byteOffset, a.byteLength).getUint16(i, true);
describe("Krevstudio batch SVG exports", () => {
  it("writes two valid store-only ZIP members and the central directory", () => {
    const a = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const b = new TextEncoder().encode('<svg><path d="M 0 0"/></svg>');
    const zip = bundleSvgZip([
      { name: "slide-1.svg", bytes: a },
      { name: "slide-2.svg", bytes: b },
    ]);
    expect(read32(zip, 0)).toBe(0x04034b50);
    const len = read16(zip, 26),
      next = 30 + len + a.length;
    expect(read32(zip, next)).toBe(0x04034b50);
    expect(read32(zip, zip.length - 22)).toBe(0x06054b50);
    expect(read16(zip, zip.length - 14)).toBe(2);
    const centralOffset = read32(zip, zip.length - 6);
    expect(read32(zip, centralOffset)).toBe(0x02014b50);
    expect(read32(zip, centralOffset + 42)).toBe(0);
    expect(read32(zip, 0 + 18)).toBe(a.length);
  });
  it("rejects empty, excessive, oversized and path-traversal exports", () => {
    expect(() => bundleSvgZip([])).toThrow();
    expect(() =>
      bundleSvgZip(
        Array.from({ length: 11 }, () => ({
          name: "slide.svg",
          bytes: new Uint8Array(0),
        })),
      ),
    ).toThrow();
    expect(() =>
      bundleSvgZip([{ name: "../evil.svg", bytes: new Uint8Array(1) }]),
    ).toThrow();
    expect(() =>
      bundleSvgZip([{ name: "large.svg", bytes: new Uint8Array(2_000_001) }]),
    ).toThrow();
  });
});
