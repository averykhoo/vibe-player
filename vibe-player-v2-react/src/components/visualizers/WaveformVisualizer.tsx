// vibe-player-v2-react/src/components/visualizers/WaveformVisualizer.tsx
import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/player.store';
import { VISUALIZER_CONSTANTS } from '../../utils/constants'; // Ensure this path is correct

const WAVEFORM_COLOR_DEFAULT = VISUALIZER_CONSTANTS.WAVEFORM_COLOR_DEFAULT ?? '#26828E';
const WAVEFORM_HEIGHT_SCALE = VISUALIZER_CONSTANTS.WAVEFORM_HEIGHT_SCALE ?? 0.8;
// const PLAYHEAD_COLOR = VISUALIZER_CONSTANTS.PLAYHEAD_COLOR ?? '#E05006'; // For future playhead

export default function WaveformVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformData = usePlayerStore(state => state.waveformData);
  // For future playhead:
  // const currentTime = usePlayerStore(state => state.currentTime);
  // const duration = usePlayerStore(state => state.duration);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // ResizeObserver for responsive canvas
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

      if (!waveformData || waveformData.length === 0 || waveformData[0].length === 0) {
        return;
      }

      const numChannels = waveformData.length;
      const channelHeight = height / numChannels;

      context.strokeStyle = WAVEFORM_COLOR_DEFAULT;
      context.lineWidth = 1;

      for (let c = 0; c < numChannels; c++) {
        const channelData = waveformData[c];
        if (!channelData || channelData.length === 0) continue;

        const dataPoints = channelData.length;
        const stepX = width / dataPoints;
        const channelCenterY = channelHeight * c + channelHeight / 2;

        context.beginPath();
        context.moveTo(0, channelCenterY - channelData[0] * (channelHeight / 2) * WAVEFORM_HEIGHT_SCALE);

        for (let i = 1; i < dataPoints; i++) {
          const x = i * stepX;
          const yValue = channelData[i] * (channelHeight / 2) * WAVEFORM_HEIGHT_SCALE;
          context.lineTo(x, channelCenterY - yValue);
        }
        context.stroke();
      }

      // Future playhead drawing logic:
      // if (duration > 0) {
      //   const playheadX = (currentTime / duration) * width;
      //   context.strokeStyle = PLAYHEAD_COLOR;
      //   context.lineWidth = 2;
      //   context.beginPath();
      //   context.moveTo(playheadX, 0);
      //   context.lineTo(playheadX, height);
      //   context.stroke();
      // }
    };

    draw(); // Initial draw

    return () => {
      resizeObserver.unobserve(canvas); // Cleanup observer
    };
  }, [waveformData]); // Re-run effect if waveformData changes. Add currentTime, duration for playhead.

  // The Svelte version had a card wrapper, App.tsx might provide it.
  // The aspect ratio and sizing will be controlled by the parent div in App.tsx.
  return (
    <canvas
      ref={canvasRef}
      data-testid="waveform-canvas"
      className="w-full h-full bg-muted/30 rounded" // Added some basic styling
    />
  );
}
