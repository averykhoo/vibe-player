// vibe-player-v2-react/src/components/visualizers/WaveformVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WaveformVisualizer from '../WaveformVisualizer';
import { usePlayerStore, PlayerState } from '../../stores/player.store';

// Mock ResizeObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn(); // Not used by current WaveformVisualizer, but good to have for completeness
const mockDisconnect = vi.fn();

vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
})));

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

// Mock getContext for canvas
const mockClearRect = vi.fn();
const mockFillRect = vi.fn(); // For background
const mockFillText = vi.fn(); // For "no data" message
const mockBeginPath = vi.fn();
const mockMoveTo = vi.fn();
const mockLineTo = vi.fn();
const mockStroke = vi.fn();

const mockGetContext = vi.fn(() => ({
  clearRect: mockClearRect,
  fillRect: mockFillRect,
  fillText: mockFillText,
  beginPath: mockBeginPath,
  moveTo: mockMoveTo,
  lineTo: mockLineTo,
  stroke: mockStroke,
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  textAlign: '',
  font: '',
}));

describe('WaveformVisualizer', () => {
  beforeEach(() => {
    usePlayerStore.setState(initialPlayerState, true); // Reset store
    vi.clearAllMocks(); // Clear all Vitest mocks

    // HTMLCanvasElement and its properties (getContext, offsetWidth, offsetHeight)
    // are now globally mocked via src/setupTests.ts.
    // Similar to SpectrogramVisualizer.test.tsx, relying on global mock.
    // HTMLCanvasElement.prototype.getContext = mockGetContext; // No longer needed
    // Object.defineProperty(HTMLCanvasElement.prototype, 'offsetWidth', { configurable: true, value: 300 }); // No longer needed
    // Object.defineProperty(HTMLCanvasElement.prototype, 'offsetHeight', { configurable: true, value: 150 }); // No longer needed
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
