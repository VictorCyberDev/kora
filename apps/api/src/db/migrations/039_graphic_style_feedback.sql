-- Original M14: extend the existing append-only brand feedback store.
-- Do not create a parallel memory table; historical feedback remains intact.
ALTER TABLE creative_feedback
  DROP CONSTRAINT IF EXISTS creative_feedback_kind_check;
ALTER TABLE creative_feedback
  ADD CONSTRAINT creative_feedback_kind_check
  CHECK (kind IN (
    'DIRECTION_CHOSEN',
    'DIRECTION_REJECTED',
    'REGENERATED',
    'IMAGE_REJECTED',
    'PALETTE_CHANGED',
    'FONT_CHANGED',
    'ARTIFACT_APPROVED',
    'NUDGE_APPLIED',
    'GRAPHIC_STYLE_FEEDBACK'
  ));
