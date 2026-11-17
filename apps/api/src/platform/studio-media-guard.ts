/**
 * Studio media tenancy boundary. Any edit path (Puck, natural-language edit,
 * page mutation, legacy patch) is checked against the original version plus
 * this site's own approved media. A changed media URL never becomes trusted
 * simply because a UI selector supplied it.
 */
export function mediaUrls(spec: unknown): Set<string> {
  const output = new Set<string>();
  const inspect = (value: unknown, depth = 0): void => {
    if (depth > 40 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) inspect(item, depth + 1);
      return;
    }
    const obj = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(obj)) {
      if (
        (key === "media" || key === "logo") &&
        val &&
        typeof val === "object"
      ) {
        const m = val as Record<string, unknown>;
        if (typeof m.url === "string") output.add(m.url);
        if (Array.isArray(m.srcset))
          for (const variant of m.srcset as unknown[])
            if (
              variant &&
              typeof variant === "object" &&
              "url" in variant &&
              typeof variant.url === "string"
            )
              output.add(variant.url);
      }
      inspect(val, depth + 1);
    }
  };
  inspect(spec);
  return output;
}
export function unapprovedMediaUrls(
  oldSpec: unknown,
  candidate: unknown,
  ownerPhotos: readonly { url: string; srcset?: readonly { url: string }[] }[],
  ownerLogo?: { url: string } | null,
): string[] {
  const allowed = mediaUrls(oldSpec);
  for (const photo of ownerPhotos) {
    allowed.add(photo.url);
    for (const variant of photo.srcset ?? []) allowed.add(variant.url);
  }
  if (ownerLogo?.url) allowed.add(ownerLogo.url);
  return [...mediaUrls(candidate)].filter((url) => !allowed.has(url));
}
