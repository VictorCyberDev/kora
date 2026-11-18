/** Strictly bounded, uncompressed ZIP for owner-authorized creative SVG exports.
 * No third-party runtime, archive extraction, arbitrary paths or server persistence. */
export function bundleSvgZip(
  files: { name: string; bytes: Uint8Array }[],
): Uint8Array {
  if (!files.length || files.length > 10)
    throw new Error("Export requires 1–10 slides");
  const enc = new TextEncoder();
  const out: Uint8Array[] = [];
  const centers: Uint8Array[] = [];
  let offset = 0;
  const write16 = (v: DataView, o: number, n: number) =>
    v.setUint16(o, n, true);
  const write32 = (v: DataView, o: number, n: number) =>
    v.setUint32(o, n >>> 0, true);
  const crc32 = (data: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of data) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    if (!/^[A-Za-z0-9_.-]+\.svg$/.test(file.name) || file.name.length > 128)
      throw new Error("Invalid SVG export filename");
    if (file.bytes.length > 2_000_000)
      throw new Error("SVG export is too large");
    const name = enc.encode(file.name),
      size = file.bytes.length,
      crc = crc32(file.bytes);
    const local = new Uint8Array(30 + name.length),
      h = new DataView(local.buffer);
    write32(h, 0, 0x04034b50);
    write16(h, 4, 20);
    write16(h, 6, 0);
    write16(h, 8, 0);
    write32(h, 14, crc);
    write32(h, 18, size);
    write32(h, 22, size);
    write16(h, 26, name.length);
    local.set(name, 30);
    out.push(local, file.bytes);
    const central = new Uint8Array(46 + name.length),
      v = new DataView(central.buffer);
    write32(v, 0, 0x02014b50);
    write16(v, 4, 20);
    write16(v, 6, 20);
    write32(v, 16, crc);
    write32(v, 20, size);
    write32(v, 24, size);
    write16(v, 28, name.length);
    write32(v, 42, offset);
    central.set(name, 46);
    centers.push(central);
    offset += local.length + size;
  }
  const centerSize = centers.reduce((n, x) => n + x.length, 0);
  const end = new Uint8Array(22),
    v = new DataView(end.buffer);
  write32(v, 0, 0x06054b50);
  write16(v, 8, files.length);
  write16(v, 10, files.length);
  write32(v, 12, centerSize);
  write32(v, 16, offset);
  const total = offset + centerSize + end.length;
  if (total > 21_000_000) throw new Error("Batch export exceeds 21 MB");
  const result = new Uint8Array(total);
  let at = 0;
  for (const part of [...out, ...centers, end]) {
    result.set(part, at);
    at += part.length;
  }
  return result;
}
