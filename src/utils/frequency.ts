// 118.1, 121.9, 118.125 (8.33 kHz spacing); never a bare "118." or a trailing 0.
export const spokenFrequency = (megahertz: number): string => {
  const trimmed = megahertz.toFixed(3).replace(/0+$/, "");

  return trimmed.endsWith(".") ? `${trimmed}0` : trimmed;
};
