/** M16: when a channel is not connected, Kora hands over a finished pack instead of pretending to publish. */
import type { BundleChannel } from "./bundle.js";

export interface HandoffPack {
  channel: BundleChannel;
  caption: string;
  assetFile: string;
  steps: string[];
  copyButtonText: string;
  /** Always true: a hand-off is something the owner does. Kora never claims it was published. */
  manual: true;
}

const STEPS: Record<BundleChannel, string[]> = {
  instagram: [
    "Open Instagram and tap +",
    "Choose the saved image",
    "Paste the caption",
    "Share",
  ],
  facebook: [
    "Open your Facebook Page",
    "Create post and add the image",
    "Paste the caption",
    "Publish",
  ],
  whatsapp: [
    "Open WhatsApp Status",
    "Add the saved image",
    "Paste the caption",
    "Send to your contacts",
  ],
  google_business: [
    "Open your Google Business Profile",
    "Add update",
    "Add the image and paste the text",
    "Publish",
  ],
};

export function handoffPack(i: {
  channel: BundleChannel;
  caption: string;
  assetFile: string;
  approvedHash: string;
  currentHash: string;
}): HandoffPack {
  if (i.approvedHash !== i.currentHash)
    throw new Error(
      "The text changed after approval; approve it again before handing it over.",
    );
  return {
    channel: i.channel,
    caption: i.caption,
    assetFile: i.assetFile,
    steps: STEPS[i.channel],
    copyButtonText: "Copy caption",
    manual: true,
  };
}
