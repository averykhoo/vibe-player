// vibe-player-v2-react/src/components/visualizers/SpectrogramVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpectrogramVisualizer from '../SpectrogramVisualizer';
import { useAnalysisStore, AnalysisState } from '../../stores/analysis.store';
import { usePlayerStore, PlayerState } from '../../stores/player.store';
// Import the actual getViridisColor or mock its module if it's complex.
// For this test, we can spy on it if it's simple or just test canvas output.

// Mock ResizeObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect,
})));

const initialAnalysisState: AnalysisState = useAnalysisStore.getState();
const initialPlayerState: PlayerState = usePlayerStore.getState();

// Mock getContext for canvas
const mockFillRect = vi.fn();
const mockClearRect = vi.fn();
const mockFillText = vi.fn();

const mockGetContext = vi.fn(() => ({
  fillRect: mockFillRect,
  clearRect: mockClearRect,
  fillText: mockFillText,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  // Mock other properties and methods as needed by the drawing logic
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 0,
  textAlign: '', // Add if fillText is used with textAlign
  // Add other properties that might be set by the component
  // e.g., font if fillText is used
  font: '',
}));


describe('SpectrogramVisualizer', () => {
  beforeEach(() => {
    useAnalysisStore.setState(initialAnalysisState, true); // Reset analysis store
    usePlayerStore.setState(initialPlayerState, true);   // Reset player store

    vi.clearAllMocks(); // Clears all mocks

    // HTMLCanvasElement and its properties (getContext, offsetWidth, offsetHeight)
    // are now globally mocked via src/setupTests.ts.
    // Individual tests can still override getContext if needed by re-mocking on the specific canvas instance.
    // For a generic '2d' context, the global mock should suffice.
    // If tests rely on specific return values from getContext calls that differ from the global mock,
    // those specific canvas instances might need more targeted mocking if the global one isn't enough.
    // For now, relying on global mock. The specific mockGetContext variable can be used if needed later
    // to provide custom mock implementations to specific canvas instances if tests become more granular.
    // HTMLCanvasElement.prototype.getContext = mockGetContext; // No longer needed if global mock is sufficient
    // Object.defineProperty(HTMLCanvasElement.prototype, 'offsetWidth', { configurable: true, value: 300 }); // No longer needed
    // Object.defineProperty(HTMLCanvasElement.prototype, 'offsetHeight', { configurable: true, value: 150 }); // No longer needed

  });

  it('renders a canvas element with an ARIA label and role', () => {
    render(<SpectrogramVisualizer />);
    const canvas = screen.getByRole('img', { name: /audio spectrogram visualizer/i });
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('observes canvas with ResizeObserver on mount and disconnects on unmount', () => {
    const { unmount } = render(<SpectrogramVisualizer />);
    expect(mockObserve).toHaveBeenCalledTimes(1);
    unmount();
    expect(mockDisconnect).toHaveBeenCalledTimes(1); // Changed from unobserve based on typical ResizeObserver cleanup
  });

  it('clears canvas and shows "No spectrogram data" if playable but no data', () => {
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: null });
    render(<SpectrogramVisualizer />);
    expect(mockClearRect).toHaveBeenCalled();
    expect(mockFillText).toHaveBeenCalledWith('No spectrogram data', 150, 75); // Assuming canvas width 300, height 150
  });

  it('clears canvas if not playable', () => {
    usePlayerStore.setState({ isPlayable: false });
    useAnalysisStore.setState({ spectrogramData: [[new Float32Array([0.5])]] }); // Has data but not playable
    render(<SpectrogramVisualizer />);
    expect(mockClearRect).toHaveBeenCalled();
    expect(mockFillText).not.toHaveBeenCalledWith('No spectrogram data', expect.anything(), expect.anything());
  });

  it('draws spectrogram when data is present and playable', () => {
    const mockData: Float32Array[] = [
      new Float32Array([0.1, 0.2, 0.3]), // Time slice 1
      new Float32Array([0.4, 0.5, 0.6]), // Time slice 2
    ];
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: mockData });

    render(<SpectrogramVisualizer />);

    expect(mockClearRect).toHaveBeenCalled(); // Initial clear
    // Total bins = mockData.length * mockData[0].length = 2 * 3 = 6
    expect(mockFillRect).toHaveBeenCalledTimes(mockData.length * mockData[0].length);
  });

  it('does not attempt to draw if canvas context cannot be obtained', () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null); // Simulate context failure
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: [[new Float32Array([0.5])]] });
    render(<SpectrogramVisualizer />);
    expect(mockClearRect).not.toHaveBeenCalled();
    expect(mockFillRect).not.toHaveBeenCalled();
  });

   it('handles empty frequency bins gracefully', () => {
    const mockDataEmptyBins: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: mockDataEmptyBins });
    render(<SpectrogramVisualizer />);
    expect(mockClearRect).toHaveBeenCalled();
    expect(mockFillText).toHaveBeenCalledWith('No spectrogram data', 150, 75); // Or specific message for empty bins
    expect(mockFillRect).not.toHaveBeenCalled();
  });
});
