// vibe-player-v2-react/src/utils/formatters.ts
// vibe-player-v2/src/lib/utils/formatters.ts

/**
 * Formats a duration in seconds into a "minutes:seconds" string.
 * Ensures seconds are padded with a leading zero if less than 10.
 * Handles NaN or negative inputs by treating them as 0.
 * @param {number} sec - The duration in seconds.
 * @returns {string} The formatted time string (e.g., "5:02", "12:30").
 */
export function formatTime(sec: number): string {
  if (isNaN(sec) || sec < 0) sec = 0;
  const minutes = Math.floor(sec / 60);
  const seconds = Math.floor(sec % 60);
  return `${minutes}:${seconds < 10 ? "0" + seconds : seconds}`;
}
