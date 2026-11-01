/**
 * Generated media from open-source models, behind one small interface. Providers are HTTP APIs the owner configures;
 * nothing is called unless a provider is configured, and every result carries provenance and starts UNREVIEWED.
 *
 *  - huggingface: FLUX.1-schnell (Apache-2.0) over the Hugging Face Inference API. Video: Lightricks LTX-Video.
 *  - sdwebui:     a self-hosted AUTOMATIC1111 Stable Diffusion WebUI (`--api`), any open checkpoint the host installs.
 */
import { createHash } from "node:crypto";

export interface GenRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
}
export interface GenResult {
  bytes: Buffer;
  mime: string;
  provenance: {
    provider: string;
    model: string;
    license: string;
    promptHash: string;
    seed: number | null;
    generated: true;
    /** A person must review generated food/product imagery before it is used anywhere. */
    review: "UNREVIEWED";
  };
}
export interface MediaProvider {
  readonly id: string;
  readonly kind: "image" | "video";
  generate(r: GenRequest, signal?: AbortSignal): Promise<GenResult>;
}

export class MediaGenError extends Error {
  constructor(
    message: string,
    readonly code:
      "not_configured" | "provider_error" | "bad_output" | "timeout",
  ) {
    super(message);
  }
}

const hash = (s: string) =>
  createHash("sha256").update(s).digest("hex").slice(0, 16);
const sniff = (b: Buffer): string | null =>
  b
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ? "image/png"
    : b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
      ? "image/jpeg"
      : b.subarray(0, 4).toString() === "RIFF" &&
          b.subarray(8, 12).toString() === "WEBP"
        ? "image/webp"
        : null;
const isMp4 = (b: Buffer) => b.subarray(4, 8).toString() === "ftyp";

type Fetch = typeof fetch;
const dims = (n: number) =>
  Math.min(1536, Math.max(256, Math.round(n / 64) * 64));

export function huggingFaceImage(o: {
  token: string;
  model?: string;
  baseUrl?: string;
  fetch?: Fetch;
}): MediaProvider {
  const model = o.model ?? "black-forest-labs/FLUX.1-schnell";
  const base = (
    o.baseUrl ?? "https://router.huggingface.co/hf-inference/models"
  ).replace(/\/+$/, "");
  const f = o.fetch ?? fetch;
  return {
    id: "huggingface",
    kind: "image",
    async generate(r, signal) {
      const res = await f(`${base}/${model}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${o.token}`,
          "content-type": "application/json",
          accept: "image/png",
        },
        body: JSON.stringify({
          inputs: r.prompt,
          parameters: {
            width: dims(r.width),
            height: dims(r.height),
            ...(r.negativePrompt && { negative_prompt: r.negativePrompt }),
            ...(r.seed !== undefined && { seed: r.seed }),
          },
        }),
        ...(signal && { signal }),
      });
      if (!res.ok)
        throw new MediaGenError(
          `Hugging Face answered ${res.status}`,
          "provider_error",
        );
      const bytes = Buffer.from(await res.arrayBuffer());
      const mime = sniff(bytes);
      if (!mime)
        throw new MediaGenError(
          "The provider did not return an image.",
          "bad_output",
        );
      return {
        bytes,
        mime,
        provenance: prov("huggingface", model, "Apache-2.0", r),
      };
    },
  };
}

export function sdWebUiImage(o: {
  baseUrl: string;
  model?: string;
  steps?: number;
  fetch?: Fetch;
}): MediaProvider {
  const f = o.fetch ?? fetch;
  const base = o.baseUrl.replace(/\/+$/, "");
  return {
    id: "sdwebui",
    kind: "image",
    async generate(r, signal) {
      const res = await f(`${base}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: r.prompt,
          negative_prompt: r.negativePrompt ?? "",
          width: dims(r.width),
          height: dims(r.height),
          steps: o.steps ?? 20,
          seed: r.seed ?? -1,
          ...(o.model && {
            override_settings: { sd_model_checkpoint: o.model },
          }),
        }),
        ...(signal && { signal }),
      });
      if (!res.ok)
        throw new MediaGenError(
          `Image server answered ${res.status}`,
          "provider_error",
        );
      const j = (await res.json()) as { images?: string[] };
      const b64 = j.images?.[0];
      if (!b64)
        throw new MediaGenError(
          "The image server returned no image.",
          "bad_output",
        );
      const bytes = Buffer.from(b64, "base64");
      const mime = sniff(bytes);
      if (!mime)
        throw new MediaGenError(
          "The image server did not return an image.",
          "bad_output",
        );
      return {
        bytes,
        mime,
        provenance: prov(
          "sdwebui",
          o.model ?? "server-default",
          "per-checkpoint",
          r,
        ),
      };
    },
  };
}

/** Text-to-video over the Hugging Face Inference API. Not exercised against the live service in this repo. */
export function huggingFaceVideo(o: {
  token: string;
  model?: string;
  baseUrl?: string;
  fetch?: Fetch;
}): MediaProvider {
  const model = o.model ?? "Lightricks/LTX-Video";
  const base = (
    o.baseUrl ?? "https://router.huggingface.co/hf-inference/models"
  ).replace(/\/+$/, "");
  const f = o.fetch ?? fetch;
  return {
    id: "huggingface-video",
    kind: "video",
    async generate(r, signal) {
      const res = await f(`${base}/${model}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${o.token}`,
          "content-type": "application/json",
          accept: "video/mp4",
        },
        body: JSON.stringify({ inputs: r.prompt }),
        ...(signal && { signal }),
      });
      if (!res.ok)
        throw new MediaGenError(
          `Hugging Face answered ${res.status}`,
          "provider_error",
        );
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!isMp4(bytes))
        throw new MediaGenError(
          "The provider did not return a video.",
          "bad_output",
        );
      return {
        bytes,
        mime: "video/mp4",
        provenance: prov("huggingface-video", model, "see model card", r),
      };
    },
  };
}

function prov(
  provider: string,
  model: string,
  license: string,
  r: GenRequest,
): GenResult["provenance"] {
  return {
    provider,
    model,
    license,
    promptHash: hash(r.prompt),
    seed: r.seed ?? null,
    generated: true,
    review: "UNREVIEWED",
  };
}

/** Provider chain from the environment. Empty when nothing is configured. */
export function mediaProvidersFromEnv(
  env: Record<string, string | undefined>,
  f?: Fetch,
): {
  image: MediaProvider[];
  video: MediaProvider[];
} {
  const image: MediaProvider[] = [];
  const video: MediaProvider[] = [];
  const order = (env.KORA_IMAGE_PROVIDERS ?? "sdwebui,huggingface")
    .split(",")
    .map((s) => s.trim());
  for (const id of order) {
    if (id === "sdwebui" && env.KORA_SDWEBUI_URL)
      image.push(
        sdWebUiImage({
          baseUrl: env.KORA_SDWEBUI_URL,
          ...(env.KORA_SDWEBUI_MODEL && { model: env.KORA_SDWEBUI_MODEL }),
          ...(f && { fetch: f }),
        }),
      );
    if (id === "huggingface" && env.HF_TOKEN)
      image.push(
        huggingFaceImage({
          token: env.HF_TOKEN,
          ...(env.KORA_HF_IMAGE_MODEL && { model: env.KORA_HF_IMAGE_MODEL }),
          ...(env.KORA_HF_BASE_URL && { baseUrl: env.KORA_HF_BASE_URL }),
          ...(f && { fetch: f }),
        }),
      );
  }
  if (env.HF_TOKEN && env.KORA_HF_VIDEO === "true")
    video.push(
      huggingFaceVideo({
        token: env.HF_TOKEN,
        ...(env.KORA_HF_BASE_URL && { baseUrl: env.KORA_HF_BASE_URL }),
        ...(f && { fetch: f }),
      }),
    );
  return { image, video };
}

/** Tries each provider in order; the first success wins. Throws not_configured when the chain is empty. */
export async function generateWithChain(
  chain: readonly MediaProvider[],
  r: GenRequest,
  timeoutMs = 60_000,
): Promise<GenResult> {
  if (chain.length === 0)
    throw new MediaGenError(
      "No generation provider is configured.",
      "not_configured",
    );
  let last: unknown;
  for (const p of chain) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await p.generate(r, ac.signal);
    } catch (e) {
      last = ac.signal.aborted
        ? new MediaGenError("The provider took too long.", "timeout")
        : e;
    } finally {
      clearTimeout(t);
    }
  }
  throw last instanceof MediaGenError
    ? last
    : new MediaGenError("Generation failed.", "provider_error");
}

/**
 * A prompt built only from what the owner stated. It names the subject the owner gave, never invents a venue, people,
 * brand marks or text, and always forbids lettering so generated images cannot carry fake claims.
 */
export function buildImagePrompt(i: {
  subject: string;
  style: "photo" | "illustration";
  setting?: string;
  palette?: string[];
}): { prompt: string; negativePrompt: string } {
  const subject = i.subject
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120);
  const style =
    i.style === "photo"
      ? "natural light product photograph, shallow depth of field"
      : "clean flat illustration";
  const set = i.setting
    ? `, ${i.setting
        .replace(/[\r\n]+/g, " ")
        .trim()
        .slice(0, 80)}`
    : ", plain neutral surface";
  const pal = i.palette?.length
    ? `, colour palette ${i.palette.slice(0, 3).join(" ")}`
    : "";
  return {
    prompt: `${subject}, ${style}${set}${pal}, no people, no text`,
    negativePrompt:
      "text, letters, watermark, logo, signature, people, hands, faces, deformed, blurry, low quality",
  };
}
