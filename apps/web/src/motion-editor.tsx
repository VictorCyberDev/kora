import { useEffect, useState } from "react";
import { api, type J } from "./api";
import { Notice, errText, useLoad } from "./ui";

const id = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function direction(
  brand: J,
  format: string,
  headline: string,
  detail: string,
  cta: string,
  variant: number,
) {
  const scenes = [
    {
      id: "opening",
      startSec: 0,
      durationSec: 2,
      transition: {
        type: variant === 0 ? "fade" : variant === 1 ? "slide" : "zoom",
        durationSec: 0.3,
      },
      motion: {
        preset: variant === 1 ? "kinetic-type" : "editorial-reveal",
        easing: "ease-out",
        travel: variant === 2 ? 0.25 : 0.12,
        scaleFrom: variant === 2 ? 0.88 : 1,
      },
      backgroundToken: "background",
      layers: [
        {
          id: "headline",
          type: "text",
          x: 0.08,
          y: 0.16,
          width: 0.84,
          height: 0.32,
          opacity: 1,
          overflow: "clip",
          text: headline,
          role: "headline",
          align: variant === 1 ? "center" : "left",
        },
        {
          id: "opening-motif",
          type: "graphic",
          x: 0.08,
          y: 0.09,
          width: variant === 1 ? 0.84 : 0.25,
          height: 0.03,
          opacity: 1,
          overflow: "clip",
          motif: "line",
          colorToken: "accent",
        },
      ],
    },
    {
      id: "detail",
      startSec: 2,
      durationSec: 2,
      transition: { type: "wipe", durationSec: 0.3 },
      motion: {
        preset: "product-highlight",
        easing: "ease-in-out",
        travel: 0.15,
        scaleFrom: 0.95,
      },
      backgroundToken: "accent",
      layers: [
        {
          id: "detail-copy",
          type: "text",
          x: 0.1,
          y: 0.25,
          width: 0.8,
          height: 0.3,
          opacity: 1,
          overflow: "clip",
          text: detail || "Made for the moments that matter",
          role: "body",
          align: "center",
        },
      ],
    },
    {
      id: "close",
      startSec: 4,
      durationSec: 2,
      transition: { type: "cut", durationSec: 0 },
      motion: {
        preset: "brand-motif",
        easing: "ease-out",
        travel: 0.1,
        scaleFrom: 1,
      },
      backgroundToken: "foreground",
      layers: [
        {
          id: "cta",
          type: "text",
          x: 0.1,
          y: 0.32,
          width: 0.8,
          height: 0.2,
          opacity: 1,
          overflow: "clip",
          text: cta || "Learn more",
          role: "cta",
          align: "center",
        },
        {
          id: "brand",
          type: "graphic",
          x: 0.1,
          y: 0.78,
          width: 0.8,
          height: 0.08,
          opacity: 1,
          overflow: "clip",
          motif: "logo",
          colorToken: "accent",
        },
      ],
    },
  ];
  return {
    version: 2,
    format,
    durationSec: 6,
    brand,
    scenes,
    captions: scenes.map((scene, index) => ({
      id: `caption-${index + 1}`,
      sceneId: scene.id,
      startSec: scene.startSec,
      endSec: scene.startSec + scene.durationSec,
      text:
        index === 0
          ? headline
          : index === 1
            ? detail || "Made for the moments that matter"
            : cta || "Learn more",
    })),
    audio: null,
  };
}

const recalc = (source: J) => {
  let cursor = 0;
  const old = new Map(source.scenes.map((scene: J) => [scene.id, scene]));
  const scenes = source.scenes.map((scene: J) => {
    const next = { ...scene, startSec: cursor };
    cursor += Number(scene.durationSec);
    return next;
  });
  const byId = new Map(scenes.map((scene: J) => [scene.id, scene]));
  const captions = source.captions
    .filter((cue: J) => byId.has(cue.sceneId))
    .map((cue: J) => {
      const before = old.get(cue.sceneId) as J;
      const after = byId.get(cue.sceneId) as J;
      const offset = Math.max(0, cue.startSec - before.startSec);
      const length = Math.max(0.1, cue.endSec - cue.startSec);
      return {
        ...cue,
        startSec: after.startSec + Math.min(offset, after.durationSec - 0.1),
        endSec:
          after.startSec +
          Math.min(
            after.durationSec,
            Math.min(offset, after.durationSec - 0.1) + length,
          ),
      };
    });
  return { ...source, scenes, captions, durationSec: cursor };
};

export function MotionTimelineEditor({
  siteId,
  facts,
  options,
}: {
  siteId: string;
  facts: J;
  options: J;
}) {
  const projects = useLoad<J[]>(
    () => api("GET", `/api/sites/${siteId}/motion/projects`),
    [siteId],
  );
  const media = useLoad<J>(
    () => api("GET", `/api/sites/${siteId}/media-library`),
    [siteId],
  );
  const audio = useLoad<J[]>(
    () => api("GET", `/api/sites/${siteId}/motion/audio`),
    [siteId],
  );
  const [brief, setBrief] = useState("");
  const [format, setFormat] = useState("story");
  const [directions, setDirections] = useState<J[]>([]);
  const [project, setProject] = useState<J | null>(null);
  const [timeline, setTimeline] = useState<J | null>(null);
  const [selectedScene, setSelectedScene] = useState("opening");
  const [selectedLayer, setSelectedLayer] = useState("");
  const [history, setHistory] = useState<J[]>([]);
  const [future, setFuture] = useState<J[]>([]);
  const [frames, setFrames] = useState<J[]>([]);
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [revisions, setRevisions] = useState<J[]>([]);
  const [audioKind, setAudioKind] = useState<"user-supplied" | "licensed">(
    "user-supplied",
  );
  const [audioSource, setAudioSource] = useState("Uploaded by owner");
  const [audioConfirmed, setAudioConfirmed] = useState(false);
  const [message, setMessage] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const activeScene = timeline?.scenes.find(
    (scene: J) => scene.id === selectedScene,
  );
  const activeLayer = activeScene?.layers.find(
    (layer: J) => layer.id === selectedLayer,
  );
  const photos = (media.data?.items ?? []).filter(
    (item: J) => item.kind === "photo",
  );

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const timer = window.setInterval(
      () => setFrameIndex((index) => (index + 1) % frames.length),
      900,
    );
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  const update = (change: (current: J) => J) => {
    if (!timeline) return;
    setHistory((items) => [...items.slice(-39), timeline]);
    setFuture([]);
    const next = recalc(change(timeline));
    setTimeline(next);
  };
  const updateScene = (change: (scene: J) => J) =>
    update((current) => ({
      ...current,
      scenes: current.scenes.map((scene: J) =>
        scene.id === selectedScene ? change(scene) : scene,
      ),
    }));
  const updateLayer = (change: (layer: J) => J) =>
    updateScene((scene) => ({
      ...scene,
      layers: scene.layers.map((layer: J) =>
        layer.id === selectedLayer ? change(layer) : layer,
      ),
    }));
  const load = async (projectId: string) => {
    try {
      const next = await api<J>(
        "GET",
        `/api/sites/${siteId}/motion/projects/${projectId}`,
      );
      setProject(next);
      setTimeline(next.timeline);
      setSelectedScene(next.timeline.scenes[0].id);
      setSelectedLayer("");
      setHistory([]);
      setFuture([]);
      setFrames([]);
      setRevisions(
        await api(
          "GET",
          `/api/sites/${siteId}/motion/projects/${projectId}/revisions`,
        ),
      );
    } catch (error) {
      setMessage({ ok: false, text: errText(error) });
    }
  };
  const preview = async () => {
    if (!timeline) return;
    try {
      const result = await api<J>(
        "POST",
        `/api/sites/${siteId}/motion/timeline/preview`,
        timeline,
      );
      setFrames(result.frames);
      setFrameIndex(0);
    } catch (error) {
      setMessage({ ok: false, text: errText(error) });
    }
  };
  const save = async () => {
    if (!timeline) return;
    try {
      const name = brief.trim() || project?.name || "Motion project";
      const saved = project
        ? await api<J>(
            "PUT",
            `/api/sites/${siteId}/motion/projects/${project.id}`,
            { name, timeline, expectedRevision: project.revision },
          )
        : await api<J>("POST", `/api/sites/${siteId}/motion/projects`, {
            name,
            timeline,
          });
      setProject(saved);
      setTimeline(saved.timeline);
      setHistory([]);
      setFuture([]);
      setMessage({ ok: true, text: `Saved revision ${saved.revision}.` });
      projects.reload();
      setRevisions(
        await api(
          "GET",
          `/api/sites/${siteId}/motion/projects/${saved.id}/revisions`,
        ),
      );
    } catch (error) {
      setMessage({ ok: false, text: errText(error) });
    }
  };

  return (
    <section className="stack" aria-label="Motion timeline editor">
      <div className="card stack">
        <p className="k-overline">Professional motion editor</p>
        <h3>From brief to editable timeline</h3>
        <label>
          Describe the video
          <textarea
            rows={3}
            value={brief}
            maxLength={240}
            placeholder="Christmas cake pre-orders for Meridian Bakes"
            onChange={(event) => setBrief(event.target.value)}
          />
        </label>
        <label>
          Video format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            {options.motion.formats.map((item: J) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button
            className="btn"
            type="button"
            disabled={!brief.trim() || !options.motion.brand}
            onClick={() =>
              setDirections(
                [0, 1, 2].map((variant) =>
                  direction(
                    options.motion.brand,
                    format,
                    brief.trim(),
                    facts.description ?? facts.offer?.summary ?? "",
                    "Order now",
                    variant,
                  ),
                ),
              )
            }
          >
            Generate directions
          </button>
          <select
            aria-label="Open motion project"
            value={project?.id ?? ""}
            onChange={(event) =>
              event.target.value && void load(event.target.value)
            }
          >
            <option value="">Open saved project…</option>
            {(projects.data ?? []).map((item: J) => (
              <option key={item.id} value={item.id}>
                {item.name} · r{item.revision}
              </option>
            ))}
          </select>
        </div>
        {directions.length > 0 && (
          <div className="k-checks" aria-label="Creative directions">
            {directions.map((item, index) => (
              <button
                className="k-check"
                type="button"
                key={index}
                onClick={() => {
                  setTimeline(item);
                  setProject(null);
                  setSelectedScene(item.scenes[0].id);
                  setDirections([]);
                }}
              >
                <strong>
                  {
                    [
                      "Editorial reveal",
                      "Kinetic campaign",
                      "Product spotlight",
                    ][index]
                  }
                </strong>
                <span className="muted">
                  {item.scenes
                    .map((scene: J) => scene.motion.preset)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {timeline && (
        <>
          <div className="card stack">
            <div className="row between">
              <strong>Timeline · {timeline.durationSec.toFixed(1)}s</strong>
              <div className="row">
                <button
                  className="btn sm quiet"
                  type="button"
                  disabled={!history.length}
                  onClick={() => {
                    const previous = history[history.length - 1];
                    if (!previous) return;
                    setFuture((items) => [timeline, ...items]);
                    setHistory((items) => items.slice(0, -1));
                    setTimeline(previous);
                  }}
                >
                  Undo
                </button>
                <button
                  className="btn sm quiet"
                  type="button"
                  disabled={!future.length}
                  onClick={() => {
                    const next = future[0];
                    if (!next) return;
                    setHistory((items) => [...items, timeline]);
                    setFuture((items) => items.slice(1));
                    setTimeline(next);
                  }}
                >
                  Redo
                </button>
                <button
                  className="btn sm"
                  type="button"
                  onClick={() => void save()}
                >
                  Save
                </button>
              </div>
            </div>
            <div className="k-frames" role="list" aria-label="Scenes">
              {timeline.scenes.map((scene: J, index: number) => (
                <button
                  type="button"
                  role="listitem"
                  className={
                    scene.id === selectedScene ? "chip active" : "chip"
                  }
                  key={scene.id}
                  onClick={() => {
                    setSelectedScene(scene.id);
                    setSelectedLayer("");
                  }}
                >
                  {index + 1}. {scene.durationSec}s
                </button>
              ))}
            </div>
            <div className="row">
              <button
                className="btn sm ghost"
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    scenes: [
                      ...current.scenes,
                      {
                        ...current.scenes[current.scenes.length - 1],
                        id: id("scene"),
                        layers: [],
                      },
                    ],
                  }))
                }
              >
                Add scene
              </button>
              <button
                className="btn sm ghost"
                type="button"
                onClick={() =>
                  update((current) => {
                    const source = current.scenes.find(
                      (scene: J) => scene.id === selectedScene,
                    );
                    return {
                      ...current,
                      scenes: [
                        ...current.scenes,
                        {
                          ...source,
                          id: id("scene"),
                          layers: source.layers.map((layer: J) => ({
                            ...layer,
                            id: id(layer.type),
                          })),
                        },
                      ],
                    };
                  })
                }
              >
                Duplicate
              </button>
              <button
                className="btn sm quiet"
                type="button"
                disabled={timeline.scenes.length === 1}
                onClick={() => {
                  const remaining = timeline.scenes.filter(
                    (scene: J) => scene.id !== selectedScene,
                  );
                  setSelectedScene(remaining[0].id);
                  update((current) => ({
                    ...current,
                    scenes: remaining,
                    captions: current.captions.filter(
                      (cue: J) => cue.sceneId !== selectedScene,
                    ),
                  }));
                }}
              >
                Delete
              </button>
              {[-1, 1].map((shift) => (
                <button
                  className="btn sm quiet"
                  type="button"
                  key={shift}
                  onClick={() =>
                    update((current) => {
                      const scenes = [...current.scenes];
                      const from = scenes.findIndex(
                        (scene: J) => scene.id === selectedScene,
                      );
                      const to = Math.max(
                        0,
                        Math.min(scenes.length - 1, from + shift),
                      );
                      const [moved] = scenes.splice(from, 1);
                      scenes.splice(to, 0, moved);
                      return { ...current, scenes };
                    })
                  }
                >
                  Move {shift < 0 ? "earlier" : "later"}
                </button>
              ))}
            </div>
          </div>

          {activeScene && (
            <div className="card stack">
              <h3>Scene settings</h3>
              <div className="grid2">
                <label>
                  Duration
                  <input
                    type="number"
                    min="0.5"
                    max="20"
                    step="0.5"
                    value={activeScene.durationSec}
                    onChange={(event) =>
                      updateScene((scene) => ({
                        ...scene,
                        durationSec: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  Transition
                  <select
                    value={activeScene.transition.type}
                    onChange={(event) =>
                      updateScene((scene) => ({
                        ...scene,
                        transition: {
                          type: event.target.value,
                          durationSec: event.target.value === "cut" ? 0 : 0.3,
                        },
                      }))
                    }
                  >
                    {["cut", "fade", "wipe", "slide", "zoom"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Motion preset
                  <select
                    value={activeScene.motion.preset}
                    onChange={(event) =>
                      updateScene((scene) => ({
                        ...scene,
                        motion: { ...scene.motion, preset: event.target.value },
                      }))
                    }
                  >
                    {[
                      "still",
                      "editorial-reveal",
                      "kinetic-type",
                      "product-highlight",
                      "brand-motif",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Easing
                  <select
                    value={activeScene.motion.easing}
                    onChange={(event) =>
                      updateScene((scene) => ({
                        ...scene,
                        motion: { ...scene.motion, easing: event.target.value },
                      }))
                    }
                  >
                    {["linear", "ease-in", "ease-out", "ease-in-out"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>
              <div className="row">
                <button
                  className="btn sm ghost"
                  type="button"
                  onClick={() => {
                    const layerId = id("text");
                    setSelectedLayer(layerId);
                    updateScene((scene) => ({
                      ...scene,
                      layers: [
                        ...scene.layers,
                        {
                          id: layerId,
                          type: "text",
                          x: 0.1,
                          y: 0.2,
                          width: 0.8,
                          height: 0.2,
                          opacity: 1,
                          overflow: "clip",
                          text: "Edit this text",
                          role: "body",
                          align: "left",
                        },
                      ],
                    }));
                  }}
                >
                  Add text
                </button>
                <button
                  className="btn sm ghost"
                  type="button"
                  onClick={() => {
                    const layerId = id("graphic");
                    setSelectedLayer(layerId);
                    updateScene((scene) => ({
                      ...scene,
                      layers: [
                        ...scene.layers,
                        {
                          id: layerId,
                          type: "graphic",
                          x: 0.1,
                          y: 0.1,
                          width: 0.3,
                          height: 0.08,
                          opacity: 1,
                          overflow: "clip",
                          motif: "shape",
                          colorToken: "accent",
                        },
                      ],
                    }));
                  }}
                >
                  Add graphic
                </button>
                <select
                  aria-label="Add image from library"
                  value=""
                  onChange={(event) => {
                    const asset = photos.find(
                      (item: J) => item.id === event.target.value,
                    );
                    if (!asset) return;
                    const layerId = id("image");
                    setSelectedLayer(layerId);
                    updateScene((scene) => ({
                      ...scene,
                      layers: [
                        ...scene.layers,
                        {
                          id: layerId,
                          type: "image",
                          assetId: asset.id,
                          alt: asset.alt || "Business photo",
                          x: 0.05,
                          y: 0.05,
                          width: 0.9,
                          height: 0.9,
                          opacity: 1,
                          overflow: "clip",
                          fit: "cover",
                          focalX: asset.focal?.x ?? 0.5,
                          focalY: asset.focal?.y ?? 0.5,
                          missingAsset: "placeholder",
                        },
                      ],
                    }));
                  }}
                >
                  <option value="">Add image…</option>
                  {photos.map((item: J) => (
                    <option key={item.id} value={item.id}>
                      {item.alt || item.role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="k-checks" role="list" aria-label="Layers">
                {activeScene.layers.map((layer: J, index: number) => (
                  <div
                    className="k-check row between"
                    role="listitem"
                    key={layer.id}
                  >
                    <button
                      type="button"
                      className="chip"
                      aria-pressed={selectedLayer === layer.id}
                      onClick={() => setSelectedLayer(layer.id)}
                    >
                      {index + 1}. {layer.type}
                    </button>
                    <div className="row">
                      {[-1, 1].map((shift) => (
                        <button
                          className="btn sm quiet"
                          type="button"
                          key={shift}
                          onClick={() =>
                            updateScene((scene) => {
                              const layers = [...scene.layers];
                              const from = layers.findIndex(
                                (item: J) => item.id === layer.id,
                              );
                              const to = Math.max(
                                0,
                                Math.min(layers.length - 1, from + shift),
                              );
                              const [moved] = layers.splice(from, 1);
                              layers.splice(to, 0, moved);
                              return { ...scene, layers };
                            })
                          }
                        >
                          {shift < 0 ? "Back" : "Front"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {activeLayer && (
                <div className="stack" aria-label="Selected layer">
                  {activeLayer.type === "text" && (
                    <label>
                      Text
                      <textarea
                        value={activeLayer.text}
                        maxLength={240}
                        onChange={(event) =>
                          updateLayer((layer) => ({
                            ...layer,
                            text: event.target.value,
                          }))
                        }
                      />
                    </label>
                  )}
                  {activeLayer.type === "image" && (
                    <div className="grid2">
                      <label>
                        Horizontal crop
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={activeLayer.focalX}
                          onChange={(event) =>
                            updateLayer((layer) => ({
                              ...layer,
                              focalX: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Vertical crop
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={activeLayer.focalY}
                          onChange={(event) =>
                            updateLayer((layer) => ({
                              ...layer,
                              focalY: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                  )}
                  <div className="grid2">
                    {["x", "y", "width", "height"].map((field) => (
                      <label key={field}>
                        {field}
                        <input
                          type="number"
                          min={field === "x" || field === "y" ? -0.25 : 0.01}
                          max="1.5"
                          step="0.01"
                          value={activeLayer[field]}
                          onChange={(event) =>
                            updateLayer((layer) => ({
                              ...layer,
                              [field]: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <button
                    className="btn sm quiet"
                    type="button"
                    onClick={() => {
                      setSelectedLayer("");
                      updateScene((scene) => ({
                        ...scene,
                        layers: scene.layers.filter(
                          (layer: J) => layer.id !== activeLayer.id,
                        ),
                      }));
                    }}
                  >
                    Remove layer
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="card stack">
            <h3>Captions</h3>
            {timeline.captions.map((cue: J) => (
              <label key={cue.id}>
                {cue.sceneId}
                <input
                  value={cue.text}
                  maxLength={160}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      captions: current.captions.map((item: J) =>
                        item.id === cue.id
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
            ))}
            <h3>Licensed audio</h3>
            <div className="grid2">
              <label>
                Rights basis
                <select
                  value={audioKind}
                  onChange={(event) =>
                    setAudioKind(
                      event.target.value as "user-supplied" | "licensed",
                    )
                  }
                >
                  <option value="user-supplied">I own or created it</option>
                  <option value="licensed">Licensed for this use</option>
                </select>
              </label>
              <label>
                Source or license reference
                <input
                  value={audioSource}
                  maxLength={120}
                  onChange={(event) => setAudioSource(event.target.value)}
                />
              </label>
            </div>
            <label className="row">
              <input
                type="checkbox"
                checked={audioConfirmed}
                onChange={(event) => setAudioConfirmed(event.target.checked)}
              />
              I confirm I have the rights to use this audio.
            </label>
            <label>
              Upload MP3, WAV or Ogg (20 MB maximum)
              <input
                type="file"
                accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                disabled={!audioConfirmed || !audioSource.trim()}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const confirmedAt = new Date().toISOString();
                    const response = await fetch(
                      `/api/sites/${siteId}/motion/audio?licenseKind=${audioKind}&rightsConfirmedAt=${encodeURIComponent(confirmedAt)}&source=${encodeURIComponent(audioSource.trim())}`,
                      {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                          "x-requested-with": "kora",
                          "content-type":
                            file.type || "application/octet-stream",
                        },
                        body: file,
                      },
                    );
                    const payload = await response.json();
                    if (!response.ok)
                      throw new Error(
                        payload?.message ?? "The audio could not be uploaded.",
                      );
                    const saved = payload.data;
                    update((current) => ({
                      ...current,
                      audio: {
                        assetId: saved.id,
                        license: saved.license,
                        volume: 0.7,
                      },
                    }));
                    audio.reload();
                    setMessage({ ok: true, text: "Licensed audio added." });
                  } catch (error) {
                    setMessage({
                      ok: false,
                      text:
                        error instanceof Error
                          ? error.message
                          : "The audio could not be uploaded.",
                    });
                  } finally {
                    event.target.value = "";
                  }
                }}
              />
            </label>
            {(audio.data ?? []).length > 0 && (
              <label>
                Audio track
                <select
                  value={timeline.audio?.assetId ?? ""}
                  onChange={(event) => {
                    const selected = (audio.data ?? []).find(
                      (item: J) => item.id === event.target.value,
                    );
                    update((current) => ({
                      ...current,
                      audio: selected
                        ? {
                            assetId: selected.id,
                            license: selected.license,
                            volume: current.audio?.volume ?? 0.7,
                          }
                        : null,
                    }));
                  }}
                >
                  <option value="">No audio</option>
                  {(audio.data ?? []).map((item: J) => (
                    <option key={item.id} value={item.id}>
                      {item.license.source}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {timeline.audio && (
              <label>
                Audio volume
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={timeline.audio.volume}
                  onChange={(event) =>
                    update((current) => ({
                      ...current,
                      audio: {
                        ...current.audio,
                        volume: Number(event.target.value),
                      },
                    }))
                  }
                />
              </label>
            )}
            <Notice kind="info">
              Only audio you own or are licensed to use is accepted. License
              provenance stays attached to the project.
            </Notice>
          </div>

          <div className="card stack">
            <div className="row">
              <button
                className="btn"
                type="button"
                onClick={() => void preview()}
              >
                Preview frames
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={!frames.length}
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? "Pause preview" : "Play preview"}
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={!project || !options.motion.exportAvailable}
                onClick={async () => {
                  if (!project) return;
                  try {
                    await api(
                      "POST",
                      `/api/sites/${siteId}/motion/projects/${project.id}/render`,
                      { expectedRevision: project.revision },
                    );
                    setMessage({
                      ok: true,
                      text: "MP4 export queued. Progress appears in video exports below.",
                    });
                  } catch (error) {
                    setMessage({ ok: false, text: errText(error) });
                  }
                }}
              >
                Export MP4
              </button>
              {project && (
                <>
                  <a
                    className="btn ghost"
                    href={`/api/sites/${siteId}/motion/projects/${project.id}/cover`}
                    download
                  >
                    Download cover
                  </a>
                  <a
                    className="btn ghost"
                    href={`/api/sites/${siteId}/motion/projects/${project.id}/captions`}
                    download
                  >
                    Download captions
                  </a>
                </>
              )}
            </div>
            {frames[frameIndex] && (
              <img
                alt="Timeline preview"
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(frames[frameIndex].svg)}`}
              />
            )}
          </div>

          {project && revisions.length > 0 && (
            <div className="card stack">
              <h3>Version history</h3>
              {revisions.map((revision: J) => (
                <div className="row between" key={revision.id}>
                  <span>Revision {revision.revision}</span>
                  <button
                    className="btn sm quiet"
                    type="button"
                    disabled={revision.revision === project.revision}
                    onClick={async () => {
                      try {
                        const restored = await api<J>(
                          "POST",
                          `/api/sites/${siteId}/motion/projects/${project.id}/restore`,
                          {
                            revision: revision.revision,
                            expectedRevision: project.revision,
                          },
                        );
                        setProject(restored);
                        setTimeline(restored.timeline);
                        setMessage({
                          ok: true,
                          text: `Restored as revision ${restored.revision}.`,
                        });
                        await load(restored.id);
                      } catch (error) {
                        setMessage({ ok: false, text: errText(error) });
                      }
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {message && (
        <Notice kind={message.ok ? "ok" : "bad"}>{message.text}</Notice>
      )}
    </section>
  );
}
