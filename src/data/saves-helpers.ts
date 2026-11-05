/**
 * Save/check helpers used by the Living World. Only the functions consumed
 * by civ/living code live here; value bands and their modifier are shared by
 * the domain and guild checks.
 */

export const DEFAULT_BANDS = [6, 11, 16, 21] as const;
export const DEFAULT_BAND_STEP = 5;

export function valueModifier(
  value: number,
  bands: readonly number[] = DEFAULT_BANDS,
  bandStep: number = DEFAULT_BAND_STEP
): number {
  let mod = 0;
  for (const band of bands) if (value >= band) mod++;
  const top = bands[bands.length - 1];
  if (top !== undefined && bandStep > 0 && value >= top) {
    mod += Math.floor((value - top) / bandStep);
  }
  return mod;
}