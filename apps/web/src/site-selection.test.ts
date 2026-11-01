import { describe, expect, it } from "vitest";
import { preferredSite, reusableDraftSite } from "./site-selection";

const site = (x: Record<string, unknown>) => ({ id: crypto.randomUUID(), ...x });

describe("site selection", () => {
  it("prefers a published site over a newer empty shell", () => {
    const empty = site({ status: "DRAFT", currentVersionId: null, publishedVersionId: null, publicUrl: null });
    const live = site({ status: "PUBLISHED", currentVersionId: "v2", publishedVersionId: "v2", publicUrl: "https://example.test" });
    expect(preferredSite([empty, live])?.id).toBe(live.id);
  });

  it("prefers a generated draft over an empty shell when nothing is live", () => {
    const empty = site({ status: "DRAFT", currentVersionId: null, publishedVersionId: null, publicUrl: null });
    const draft = site({ status: "DRAFT", currentVersionId: "v1", publishedVersionId: null, publicUrl: null });
    expect(preferredSite([empty, draft])?.id).toBe(draft.id);
  });

  it("reuses only a truly empty site shell", () => {
    const generated = site({ status: "DRAFT", currentVersionId: "v1", publishedVersionId: null, publicUrl: null });
    const empty = site({ status: "DRAFT", currentVersionId: null, publishedVersionId: null, publicUrl: null });
    expect(reusableDraftSite([generated, empty])?.id).toBe(empty.id);
    expect(reusableDraftSite([generated])).toBeNull();
  });
});
