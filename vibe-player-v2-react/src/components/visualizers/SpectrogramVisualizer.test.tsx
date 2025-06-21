
// vibe-player-v2-react/src/components/visualizers/SpectrogramVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpectrogramVisualizer from '../SpectrogramVisualizer';
import { useAnalysisStore, AnalysisState } from '../../stores/analysis.store';
import { usePlayerStore, PlayerState } from '../../stores/player.store';
// Import the actual getViridisColor or mock its module if it's complex.
// For this test, we can spy on it if it's simple or just test canvas output.

// Global ResizeObserver and canvas mocks are now in setupTests.ts

const initialAnalysisState: AnalysisState = useAnalysisStore.getState();
const initialPlayerState: PlayerState = usePlayerStore.getState();

// Retrieve mocks from the global scope (setupTests.ts) if needed for assertions
// e.g. const mockClearRect = (HTMLCanvasElement.prototype.getContext('2d') as any).clearRect;
// For most cases, asserting against component behavior (e.g., "No data" text) is preferred.

describe('SpectrogramVisualizer', () => {
  let mockClearRect: ReturnType<typeof vi.fn>;
  let mockFillText: ReturnType<typeof vi.fn>;
  let mockFillRect: ReturnType<typeof vi.fn>;
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;


  beforeEach(() => {
    useAnalysisStore.setState(initialAnalysisState, true); // Reset analysis store
    usePlayerStore.setState(initialPlayerState, true);   // Reset player store

    // vi.clearAllMocks() is called in afterEach in setupTests.ts

    // Access the globally mocked functions for assertions if necessary
    // This ensures we are checking the same mock instances used by the component
    const contextMock = HTMLCanvasElement.prototype.getContext('2d') as any;
    mockClearRect = contextMock.clearRect;
    mockFillText = contextMock.fillText;
    mockFillRect = contextMock.fillRect;

    const resizeObserverMock = new (vi.getVmSystemGlobal().ResizeObserver as any)();
    mockObserve = resizeObserverMock.observe;
    mockDisconnect = resizeObserverMock.disconnect;

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
