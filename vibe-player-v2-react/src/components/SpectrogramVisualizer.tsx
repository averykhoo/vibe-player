import React, { useRef, useEffect, useCallback } from 'react';
import { useAnalysisStore } from '../stores/analysis.store';
import { usePlayerStore } from '../stores/player.store';

// A simple Viridis-like colormap (can be expanded or imported)
// const getColorForIntensity was removed as it was unused.
const viridisColormap = [
  [68, 1, 84],    // Deep Blue/Purple
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 155, 137],
  [53, 178, 126],
  [109, 199, 104],
  [170, 217, 70],
  [253, 231, 37]  // Bright Yellow
];

/**
 * @helper getViridisColor
 * @description Maps a normalized intensity value (0 to 1) to a Viridis-like color.
 * @param {number} intensity - The intensity value, expected to be between 0 and 1.
 * @returns {string} An RGB color string.
 */
const getViridisColor = (intensity: number): string => {
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  const colorIndex = Math.floor(clampedIntensity * (viridisColormap.length - 1));
  const [r, g, b] = viridisColormap[colorIndex];
  return `rgb(${r}, ${g}, ${b})`;
};


/**
 * @component SpectrogramVisualizer
 * @description Renders audio spectrogram data on a canvas.
 * It subscribes to `spectrogramData` from `useAnalysisStore` and `isPlayable` from `usePlayerStore`.
 */
const SpectrogramVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const spectrogramData = useAnalysisStore(useCallback(s => s.spectrogramData, []));
  const isPlayable = usePlayerStore(useCallback(s => s.isPlayable, []));
  const componentId = useRef(`spectrogram-canvas-${Math.random().toString(36).substring(7)}`).current;


  /**
   * Handles drawing the spectrogram on the canvas.
   * This effect is triggered when spectrogramData, isPlayable, or canvas dimensions change.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Determine background color based on theme (simple check)
    const isDarkMode = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDarkMode ? 'rgb(31, 41, 55)' : 'rgb(245, 245, 245)'; // dark:bg-gray-800 or bg-gray-100
    ctx.fillRect(0, 0, width, height);

    if (!isPlayable || !spectrogramData || spectrogramData.length === 0) {
      if (isPlayable) { // Only show "no data" if we expected data
        ctx.font = '14px Arial';
        ctx.fillStyle = isDarkMode ? 'rgb(156, 163, 175)' : 'rgb(107, 114, 128)'; // gray-400 or gray-500
        ctx.textAlign = 'center';
        ctx.fillText('No spectrogram data', width / 2, height / 2);
      }
      return;
    }

    const numTimeSlices = spectrogramData.length;
    const numFreqBins = spectrogramData[0]?.length || 0;

    if (numFreqBins === 0) {
      console.warn("SpectrogramVisualizer: Empty frequency bins in data.");
      return;
    }

    const colWidth = width / numTimeSlices;
    const rowHeight = height / numFreqBins;

    // Often, spectrogram magnitudes are very small or need conversion (e.g., to dB)
    // For direct visualization, we might need to find min/max or apply a log scale.
    // This example assumes magnitudes are somewhat normalized (e.g., 0 to 1 after some processing).
    for (let t = 0; t < numTimeSlices; t++) { // Iterate over time slices (columns)
      const timeSlice = spectrogramData[t];
      for (let f = 0; f < numFreqBins; f++) { // Iterate over frequency bins (rows)
        const intensity = timeSlice[f];
        // ctx.fillStyle = getColorForIntensity(intensity); // Grayscale
        ctx.fillStyle = getViridisColor(intensity); // Viridis-like

        // Draw pixel from bottom up (low freq at bottom, high freq at top)
        ctx.fillRect(t * colWidth, height - (f + 1) * rowHeight, colWidth, rowHeight);
      }
    }
  }, [spectrogramData, isPlayable, canvasRef.current?.width, canvasRef.current?.height]); // Redraw if data or dimensions change

  /**
   * Sets up a ResizeObserver to adjust canvas drawing dimensions when its container resizes.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setCanvasDimensions = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    setCanvasDimensions(); // Initial size sync

    const resizeObserver = new ResizeObserver(setCanvasDimensions);
    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, []); // Runs once on mount

  return (
    <div className="w-full h-[150px] p-2 border rounded-lg shadow-sm bg-gray-100 dark:bg-gray-700 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label="Audio spectrogram visualizer"
        role="img" // ARIA role for canvas as image
        id={componentId} // Unique ID for potential aria-describedby
      >
        Your browser does not support the canvas element.
      </canvas>
    </div>
  );
};

export default SpectrogramVisualizer;
