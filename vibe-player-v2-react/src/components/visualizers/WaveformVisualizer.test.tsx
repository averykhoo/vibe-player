// vibe-player-v2-react/src/components/visualizers/WaveformVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WaveformVisualizer from '../WaveformVisualizer';
import { usePlayerStore, PlayerState } from '../../stores/player.store';

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
  let mockClearRect: ReturnType<typeof vi.fn>;
  let mockFillRect: ReturnType<typeof vi.fn>;
  let mockFillText: ReturnType<typeof vi.fn>;
  let mockBeginPath: ReturnType<typeof vi.fn>;
  let mockMoveTo: ReturnType<typeof vi.fn>;
  let mockLineTo: ReturnType<typeof vi.fn>;
  let mockStroke: ReturnType<typeof vi.fn>;
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    usePlayerStore.setState(initialPlayerState, true); // Reset store
    // vi.clearAllMocks() is called in afterEach in setupTests.ts

    // Access the globally mocked functions for assertions
    const contextMock = HTMLCanvasElement.prototype.getContext('2d') as any;
    mockClearRect = contextMock.clearRect;
    mockFillRect = contextMock.fillRect;
    mockFillText = contextMock.fillText;
    mockBeginPath = contextMock.beginPath;
    mockMoveTo = contextMock.moveTo;
    mockLineTo = contextMock.lineTo;
    mockStroke = contextMock.stroke;

    const resizeObserverMock = new (vi.getVmSystemGlobal().ResizeObserver as any)();
    mockObserve = resizeObserverMock.observe;
    mockDisconnect = resizeObserverMock.disconnect;
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
    expect(mockClearRect).toHaveBeenCalled(); // For initial clear or background
    expect(mockFillRect).toHaveBeenCalled(); // For background fill
    expect(mockFillText).toHaveBeenCalledWith('No waveform data available', 150, 75); // Assumes canvas 300x150
  });

  it('clears canvas if not playable', () => {
    usePlayerStore.setState({ isPlayable: false, waveformData: new Float32Array([0.1, 0.2]) });
    render(<WaveformVisualizer />);
    expect(mockClearRect).toHaveBeenCalledTimes(1); // Only the initial clear
    expect(mockFillText).not.toHaveBeenCalledWith('No waveform data available', expect.anything(), expect.anything());
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

    expect(mockFillRect).toHaveBeenCalled(); // Background
    expect(mockBeginPath).toHaveBeenCalledTimes(2); // Once for waveform, once for cursor
    expect(mockStroke).toHaveBeenCalledTimes(2);   // Once for waveform, once for cursor

    // Check if cursor drawing methods were called
    // (cursorPosition = (25 / 100) * 300 = 75)
    expect(mockMoveTo).toHaveBeenCalledWith(75, 0);
    expect(mockLineTo).toHaveBeenCalledWith(75, 150);
  });

  it('does not attempt to draw if canvas context cannot be obtained', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null); // Simulate context failure
    usePlayerStore.setState({ isPlayable: true, waveformData: new Float32Array([0.5]) });
    render(<WaveformVisualizer />);
    expect(mockClearRect).not.toHaveBeenCalled();
    expect(mockFillRect).not.toHaveBeenCalled();
    expect(mockBeginPath).not.toHaveBeenCalled();
  });
});
