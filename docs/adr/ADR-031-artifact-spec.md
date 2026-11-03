# ADR-031: One ArtifactSpec and one trusted renderer

Status: accepted. v7.

**Decision.** All non-website creatives share `ArtifactSpec` (`kora.artifact/1`) and `renderArtifactSvg`, rasterised by
the existing resvg path with bundled fonts. Format drives composition, with explicit safe zones per format. Persistence
reuses the immutable `media_assets` table (spec JSON, brand version, bytes, SVG). The legacy `AssetSpec` renderer stays
for existing assets and bundles.

**Print.** 254 dpi RGB with 3 mm bleed; explicitly not press-ready.

**Consequences.** Images are references resolved by the API, never fetched by the renderer; generated pictures require
owner approval. No live posting is implied: artifacts are "created", not "posted".
