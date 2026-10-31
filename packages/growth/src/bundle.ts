import { z } from "zod";
import type { AssetFormat } from "./assets.js";
import type { ContentChannel } from "./content.js";

export const BUNDLE_CHANNELS = [
  "instagram",
  "facebook",
  "whatsapp",
  "google_business",
] as const;
export type BundleChannel = (typeof BUNDLE_CHANNELS)[number];

export const CampaignInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    objective: z
      .enum(["announce", "fill_slots", "clear_stock", "bring_back"])
      .default("announce"),
    offerId: z.string().max(41),
    channels: z.array(z.enum(BUNDLE_CHANNELS)).min(1).max(4),
    startOn: z.string().date(),
    endOn: z.string().date().optional(),
  })
  .strict();
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

export type Beat = "launch" | "reminder" | "last_chance";
export interface Slot {
  channel: BundleChannel;
  beat: Beat;
  /** ISO timestamp, 08:00 UTC (09:00 in Lagos). */
  at: string;
  format: AssetFormat;
  /** Which of the generated caption variants to use, so beats do not repeat each other. */
  variant: number;
  goal: "announce_offer";
}

/** Image shape that suits each channel. */
export const FORMAT_FOR: Record<BundleChannel, AssetFormat> = {
  instagram: "portrait",
  facebook: "landscape",
  whatsapp: "whatsapp_promo",
  google_business: "landscape",
};
const DAY = 86_400_000;
const at = (d: Date, dayOffset: number) =>
  new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + dayOffset,
      8,
      0,
      0,
    ),
  ).toISOString();

export class BundleError extends Error {}

/**
 * One campaign → several channel posts, spread over its dates. Never in the past, never after the end, and no more than
 * three beats per channel so a campaign cannot turn into spam.
 */
export function planBundle(i: CampaignInput, now: Date): Slot[] {
  const start = new Date(`${i.startOn}T00:00:00Z`);
  const end = new Date(`${i.endOn ?? i.startOn}T00:00:00Z`);
  if (end < start)
    throw new BundleError("The end date is before the start date.");
  if ((end.getTime() - start.getTime()) / DAY > 60)
    throw new BundleError("A campaign can run for at most 60 days.");
  const length = Math.round((end.getTime() - start.getTime()) / DAY);
  const offsets: Array<[Beat, number]> = [["launch", 0]];
  if (length >= 6) offsets.push(["reminder", Math.floor(length / 2)]);
  if (length >= 2) offsets.push(["last_chance", length - 1]);
  const slots: Slot[] = [];
  for (const channel of i.channels)
    offsets.forEach(([beat, off], n) => {
      const when = at(start, off);
      // a beat that is already in the past is dropped, except the launch which moves to the next 08:00
      if (Date.parse(when) < now.getTime() - 3_600_000) {
        if (beat !== "launch") return;
        const next = new Date(now.getTime() + DAY);
        slots.push({
          channel,
          beat,
          at: at(next, 0),
          format: FORMAT_FOR[channel],
          variant: n,
          goal: "announce_offer",
        });
        return;
      }
      slots.push({
        channel,
        beat,
        at: when,
        format: FORMAT_FOR[channel],
        variant: n,
        goal: "announce_offer",
      });
    });
  if (!slots.length)
    throw new BundleError(
      "Every post in this campaign would be in the past. Pick later dates.",
    );
  return slots.sort((a, b) => a.at.localeCompare(b.at));
}

export const channelForContent = (c: BundleChannel): ContentChannel => c;
