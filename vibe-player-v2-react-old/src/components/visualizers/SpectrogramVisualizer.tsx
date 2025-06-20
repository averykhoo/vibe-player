// vibe-player-v2-react/src/components/visualizers/SpectrogramVisualizer.tsx
import { useEffect, useRef } from 'react';
import { useAnalysisStore } from '../../stores/analysis.store';
import { viridisColor } from '../../utils/dsp'; // Ensure this path and export are correct
// import { VISUALIZER_CONSTANTS } from '../../utils/constants'; // If any constants are needed

export default function SpectrogramVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrogramData = useAnalysisStore(state => state.spectrogramData); // Assuming this is Float32Array[]

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width;
        canvas.height = height;
        draw();
      }
    });
    resizeObserver.observe(canvas);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      context.clearRect(0, 0, width, height);

      if (!spectrogramData || spectrogramData.length === 0 || !spectrogramData[0] || spectrogramData[0].length === 0) {
        return;
      }

      const numFrames = spectrogramData.length; // Time axis
      const numBins = spectrogramData[0].length; // Frequency axis

      const cellWidth = width / numFrames;
      const cellHeight = height / numBins;

      let minMag = Infinity, maxMag = -Infinity;
      for (let t = 0; t < numFrames; t++) {
        for (let f = 0; f < numBins; f++) {
          const mag = spectrogramData[t][f];
          if (mag < minMag) minMag = mag;
          if (mag > maxMag) maxMag = mag;
        }
      }
      maxMag = Math.max(maxMag, 0.00001); // Ensure not zero for division, and positive

      for (let t = 0; t < numFrames; t++) { // Time
        for (let f = 0; f < numBins; f++) { // Frequency
          const magnitude = spectrogramData[t][f];
          let normalizedMag = (magnitude - minMag) / (maxMag - minMag); // Normalize between 0 and 1
          // Alternative: simple scale from 0 to maxMag if minMag is effectively 0 or positive
          // let normalizedMag = magnitude / maxMag;

          normalizedMag = Math.max(0, Math.min(1, normalizedMag)); // Clamp

          const [r, g, b] = viridisColor(normalizedMag);
          context.fillStyle = `rgb(${r},${g},${b})`;
          // Draw from top (high freq) to bottom (low freq)
          context.fillRect(t * cellWidth, height - (f + 1) * cellHeight, cellWidth, cellHeight);
        }
      }
    };

    draw(); // Initial draw

    return () => {
      resizeObserver.unobserve(canvas); // Cleanup
    };
  }, [spectrogramData]); // Re-run if spectrogramData changes

  return (
    <canvas
      ref={canvasRef}
      data-testid="spectrogram-canvas"
      className="w-full h-full bg-muted/30 rounded" // Added some basic styling
    />
  );
}
