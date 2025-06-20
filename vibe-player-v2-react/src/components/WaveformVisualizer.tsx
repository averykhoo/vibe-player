import React, { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '../stores/player.store';

/**
 * @component WaveformVisualizer
 * @description Renders an audio waveform and playback cursor on a canvas element.
 * It subscribes to `waveformData`, `currentTime`, and `duration` from the `usePlayerStore`.
 */
const WaveformVisualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Selectors with useCallback for memoization to prevent unnecessary re-renders if other store parts change
  const waveformData = usePlayerStore(useCallback(s => s.waveformData, []));
  const currentTime = usePlayerStore(useCallback(s => s.currentTime, []));
  const duration = usePlayerStore(useCallback(s => s.duration, []));
  const isPlayable = usePlayerStore(useCallback(s => s.isPlayable, []));

  /**
   * Handles drawing the waveform and playback cursor on the canvas.
   * This effect is triggered when waveformData, currentTime, duration, or canvas dimensions change.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlayable) { // Also check isPlayable, no need to draw if nothing is loaded
      // Clear canvas if not playable or no canvas
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    if (!waveformData || waveformData.length === 0) {
        // If waveformData is empty or not yet loaded, clear canvas or draw a placeholder
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Optional: Draw a "No data" message or a flat line
          ctx.fillStyle = 'rgb(150, 150, 150)'; // Dark gray for text
          ctx.textAlign = 'center';
          ctx.fillText("No waveform data available", canvas.width / 2, canvas.height / 2);
        }
        return;
    }


    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = 'rgb(245, 245, 245)'; // Light background (Tailwind bg-gray-100)
    // For dark mode, this should ideally be dynamic based on theme
    // For simplicity, using a fixed color here.
    // if (document.documentElement.classList.contains('dark')) {
    //   ctx.fillStyle = 'rgb(31, 41, 55)'; // Dark background (Tailwind dark:bg-gray-800)
    // }
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.lineWidth = 1.5; // Slightly thicker line
    ctx.strokeStyle = 'rgb(59, 130, 246)'; // Blue-500
    ctx.beginPath();

    // waveformData is assumed to be an array of peak values (e.g., Float32Array from -1 to 1)
    // This drawing logic assumes waveformData contains positive peak values (0 to 1)
    // and draws a symmetrical waveform around the vertical center.
    // If waveformData contains min/max pairs or full amplitude data, this logic needs adjustment.
    const sliceWidth = width / waveformData.length;
    let x = 0;

    for (let i = 0; i < waveformData.length; i++) {
      const peakValue = waveformData[i]; // Assuming this is a single peak value (e.g. max amplitude in chunk)
      const barHeight = peakValue * height; // Scale peak to canvas height

      // Draw symmetrical bars from center
      const yCenter = height / 2;
      const yTop = yCenter - barHeight / 2;

      if (i === 0) {
        ctx.moveTo(x, yTop); // Start path
      } else {
        ctx.lineTo(x, yTop);
      }
      ctx.lineTo(x, yTop + barHeight); // Draw line to bottom of bar
      ctx.moveTo(x + sliceWidth, yTop + barHeight); // Move to next bar start (bottom)
      ctx.moveTo(x + sliceWidth, yTop); // Move to next bar start (top)


      x += sliceWidth;
    }
    // Instead of lineTo(width, height/2) which assumes line graph
    ctx.stroke();


    // Draw playback cursor
    if (duration > 0) {
      const cursorPosition = (currentTime / duration) * width;
      ctx.strokeStyle = 'rgb(239, 68, 68)'; // Red-500
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cursorPosition, 0);
      ctx.lineTo(cursorPosition, height);
      ctx.stroke();
    }
  }, [waveformData, currentTime, duration, isPlayable, canvasRef.current?.width, canvasRef.current?.height]); // Added isPlayable dependency

  /**
   * Sets up a ResizeObserver to adjust canvas drawing dimensions when its container resizes.
   * This ensures the canvas drawing area matches its display size.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Ensure canvas drawing buffer matches its display size
    const setCanvasDimensions = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight; // Using fixed height from container
    };

    setCanvasDimensions(); // Set initial size

    const resizeObserver = new ResizeObserver(setCanvasDimensions);
    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, []); // Runs once on mount

  return (
    <div className="w-full h-[100px] p-2 border rounded-lg shadow-sm bg-gray-100 dark:bg-gray-700 overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full block" aria-label="Audio waveform visualizer"></canvas>
    </div>
  );
};

export default WaveformVisualizer;
