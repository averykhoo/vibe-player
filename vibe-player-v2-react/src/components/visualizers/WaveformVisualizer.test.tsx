// vibe-player-v2-react/src/components/visualizers/WaveformVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WaveformVisualizer from '../WaveformVisualizer';
import { usePlayerStore, PlayerState } from '../../stores/player.store';
import { mockCanvasContext } from '../../test-utils/canvas.mock'; // Import the shared mock

// Global ResizeObserver and canvas mocks are now in setupTests.ts

const initialPlayerState: PlayerState = {
    status: 'idle',
    fileName: null,
    duration: 100, // Example duration
    currentTime: 0,
    isPlaying: false,
    isPlayable: false,
    speed: 1.0,
    pitchShift: 0.0,
    gain: 1.0,
    waveformData: undefined,
    error: null,
    audioBuffer: undefined,
    audioContextResumed: false,
    channels: undefined,
    sampleRate: undefined,
    lastProcessedChunk: undefined,
};

// Retrieve mocks from the global scope (setupTests.ts) if needed for assertions

describe('WaveformVisualizer', () => {
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    usePlayerStore.setState(initialPlayerState, true); // Reset store
    // vi.clearAllMocks() and mockCanvasContext cleanup is called in afterEach in setupTests.ts

    // ResizeObserver mocks are still accessed if needed for specific assertions not related to canvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resizeObserverMockInstance = new (vi.getVmSystemGlobal().ResizeObserver as any)();
    mockObserve = resizeObserverMockInstance.observe;
    mockDisconnect = resizeObserverMockInstance.disconnect;
  });

  it('renders a canvas element with ARIA label and role', () => {
    render(<WaveformVisualizer />);
    const canvas = screen.getByRole('img', { name: /audio waveform visualizer/i });
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('observes canvas with ResizeObserver on mount and disconnects on unmount', () => {
    const { unmount } = render(<WaveformVisualizer />);
    expect(mockObserve).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('clears canvas and shows "No waveform data available" if playable but no data', () => {
    usePlayerStore.setState({ isPlayable: true, waveformData: undefined });
    render(<WaveformVisualizer />);
    expect(mockCanvasContext.clearRect).toHaveBeenCalled(); // For initial clear or background
    expect(mockCanvasContext.fillRect).toHaveBeenCalled(); // For background fill
    expect(mockCanvasContext.fillText).toHaveBeenCalledWith('No waveform data available', 150, 75); // Assumes canvas 300x150
  });

  it('clears canvas if not playable', () => {
    usePlayerStore.setState({ isPlayable: false, waveformData: new Float32Array([0.1, 0.2]) });
    render(<WaveformVisualizer />);
    expect(mockCanvasContext.clearRect).toHaveBeenCalledTimes(1); // Only the initial clear
    expect(mockCanvasContext.fillText).not.toHaveBeenCalledWith('No waveform data available', expect.anything(), expect.anything());
  });

  it('draws waveform and cursor when data is present and playable', () => {
    const mockWaveData = new Float32Array(100); // 100 data points
    for(let i=0; i<100; i++) mockWaveData[i] = Math.sin(i * Math.PI / 50); // Simple sine wave

    usePlayerStore.setState({
      isPlayable: true,
      waveformData: mockWaveData,
      currentTime: 25, // Example current time
      duration: 100    // Example duration
    });
    render(<WaveformVisualizer />);

    expect(mockCanvasContext.fillRect).toHaveBeenCalled(); // Background
    expect(mockCanvasContext.beginPath).toHaveBeenCalledTimes(2); // Once for waveform, once for cursor
    expect(mockCanvasContext.stroke).toHaveBeenCalledTimes(2);   // Once for waveform, once for cursor

    // Check if cursor drawing methods were called
    // (cursorPosition = (25 / 100) * 300 = 75)
    expect(mockCanvasContext.moveTo).toHaveBeenCalledWith(75, 0);
    expect(mockCanvasContext.lineTo).toHaveBeenCalledWith(75, 150);
  });

  it('does not attempt to draw if canvas context cannot be obtained', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null); // Simulate context failure
    usePlayerStore.setState({ isPlayable: true, waveformData: new Float32Array([0.5]) });
    render(<WaveformVisualizer />);
    expect(mockCanvasContext.clearRect).not.toHaveBeenCalled();
    expect(mockCanvasContext.fillRect).not.toHaveBeenCalled();
    expect(mockCanvasContext.beginPath).not.toHaveBeenCalled();
    HTMLCanvasElement.prototype.getContext = originalGetContext; // Restore original getContext
  });
});
