// vibe-player-v2-react/src/utils/dsp.ts
// vibe-player-v2/src/lib/utils/dsp.ts

/**
 * Generates a Hann window of a given length.
 * A Hann window is a taper function used to reduce spectral leakage in FFT processing.
 * @param {number} length - The desired length of the window. Must be a positive integer.
 * @returns {number[] | null} An array representing the Hann window, or null if length is invalid.
 */
export function hannWindow(length: number): number[] | null {
  if (length <= 0 || !Number.isInteger(length)) {
    console.error("hannWindow: Length must be a positive integer.");
    return null;
  }
  const windowArr: number[] = new Array(length);
  if (length === 1) {
    windowArr[0] = 1;
    return windowArr;
  }
  const denom = length - 1;
  for (let i = 0; i < length; i++) {
    windowArr[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
  }
  return windowArr;
}

/**
 * Maps a normalized value (0 to 1) to an RGB color using the Viridis color map.
 * @param {number} t - The normalized value to map to a color (clamped between 0 and 1).
 * @returns {[number, number, number]} An array representing the [R, G, B] color components (0-255).
 */
export function viridisColor(t: number): [number, number, number] {
  // Viridis color map definition (t, R, G, B)
  // These points define segments of the color map.
  const colors: Array<[number, number, number, number]> = [
    [0.0, 68, 1, 84], // Deep blue/purple
    [0.1, 72, 40, 120],
    [0.2, 62, 74, 137],
    [0.3, 49, 104, 142],
    [0.4, 38, 130, 142],
    [0.5, 31, 155, 137],
    [0.6, 53, 178, 126],
    [0.7, 109, 199, 104],
    [0.8, 170, 217, 70],
    [0.9, 235, 231, 35],
    [1.0, 253, 231, 37], // Bright yellow
  ];

  // Clamp t to the range [0, 1] to ensure it's within the map definition
  t = Math.max(0, Math.min(1, t));

  let c1: [number, number, number, number] = colors[0];
  let c2: [number, number, number, number] = colors[colors.length - 1];
  for (let i = 0; i < colors.length - 1; i++) {
    if (t >= colors[i][0] && t <= colors[i + 1][0]) {
      c1 = colors[i];
      c2 = colors[i + 1];
      break;
    }
  }
  const range = c2[0] - c1[0];
  const ratio = range === 0 ? 0 : (t - c1[0]) / range;
  const r = Math.round(c1[1] + ratio * (c2[1] - c1[1]));
  const g = Math.round(c1[2] + ratio * (c2[2] - c1[2]));
  const b = Math.round(c1[3] + ratio * (c2[3] - c1[3]));
  return [r, g, b];
}
