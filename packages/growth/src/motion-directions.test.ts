import { describe, expect, it } from "vitest";
import { motionDirectionsFor } from "./motion-directions.js";
import { MotionTimelineSchema } from "./motion-timeline.js";

const briefs = [
  "Restaurant weekend tasting menu",
  "Bakery Christmas cake product launch",
  "Fashion capsule collection campaign",
  "Beauty serum advertisement",
  "Community design event announcement",
  "Technology productivity app launch",
  "Home cleaning service promotion",
  "Educational scholarship explainer",
  "Agency client-wins announcement",
  "Meridian Bakes brand reveal",
];

describe("professional motion directions", () => {
  it.each(briefs)(
    "creates three editable, branded directions for %s",
    (brief) => {
      const directions = motionDirectionsFor({
        brief,
        businessName: "Meridian Bakes",
        detail: "Confirmed details only",
        cta: "Learn more",
        format: "story",
        brand: {
          kitVersion: 1,
          brandOsVersion: null,
          brandOsHash: null,
        },
      });
      expect(directions).toHaveLength(3);
      expect(new Set(directions.map((item) => item.id)).size).toBe(3);
      expect(
        new Set(
          directions.map((item) =>
            item.timeline.scenes.map((scene) => scene.motion.preset).join("|"),
          ),
        ).size,
      ).toBeGreaterThan(1);
      for (const direction of directions) {
        expect(MotionTimelineSchema.parse(direction.timeline)).toEqual(
          direction.timeline,
        );
        expect(direction.timeline.scenes[0]?.layers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ type: "text", text: brief }),
          ]),
        );
      }
    },
  );
});
