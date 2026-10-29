export type LandingQuality = "smooth" | "normal" | "firm" | "hard";

const SMOOTH_BELOW_FPM = 150;
const FIRM_FROM_FPM = 400;
const HARD_FROM_FPM = 700;

export const classifyLanding = (
  touchdownVerticalSpeedFeetPerMinute: number,
): LandingQuality => {
  const rate = Math.abs(touchdownVerticalSpeedFeetPerMinute);

  if (rate < SMOOTH_BELOW_FPM) return "smooth";
  if (rate < FIRM_FROM_FPM) return "normal";
  if (rate < HARD_FROM_FPM) return "firm";

  return "hard";
};

export const isFirmOrWorse = (quality: LandingQuality): boolean =>
  quality === "firm" || quality === "hard";
