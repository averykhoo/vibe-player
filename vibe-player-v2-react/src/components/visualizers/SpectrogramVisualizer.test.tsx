
// vibe-player-v2-react/src/components/visualizers/SpectrogramVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpectrogramVisualizer from '../SpectrogramVisualizer';
import { useAnalysisStore, AnalysisState } from '../../stores/analysis.store';
import { usePlayerStore, PlayerState } from '../../stores/player.store';
import { mockCanvasContext } from '../../test-utils/canvas.mock'; // Import the shared mock

// Global ResizeObserver and canvas mocks are now in setupTests.ts

const initialAnalysisState: AnalysisState = useAnalysisStore.getState();
const initialPlayerState: PlayerState = usePlayerStore.getState();

describe('SpectrogramVisualizer', () => {
  let mockObserve: ReturnType<typeof vi.fn>;
  let mockDisconnect: ReturnType<typeof vi.fn>;


  beforeEach(() => {
    useAnalysisStore.setState(initialAnalysisState, true); // Reset analysis store
    usePlayerStore.setState(initialPlayerState, true);   // Reset player store

    // vi.clearAllMocks() and mockCanvasContext cleanup is called in afterEach in setupTests.ts

    // ResizeObserver mocks are still accessed if needed for specific assertions not related to canvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resizeObserverMockInstance = new (vi.getVmSystemGlobal().ResizeObserver as any)();
    mockObserve = resizeObserverMockInstance.observe;
    mockDisconnect = resizeObserverMockInstance.disconnect;
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
    expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    expect(mockCanvasContext.fillText).toHaveBeenCalledWith('No spectrogram data', 150, 75); // Assuming canvas width 300, height 150
  });

  it('clears canvas if not playable', () => {
    usePlayerStore.setState({ isPlayable: false });
    useAnalysisStore.setState({ spectrogramData: [[new Float32Array([0.5])]] }); // Has data but not playable
    render(<SpectrogramVisualizer />);
    expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    expect(mockCanvasContext.fillText).not.toHaveBeenCalledWith('No spectrogram data', expect.anything(), expect.anything());
  });

  it('draws spectrogram when data is present and playable', () => {
    const mockData: Float32Array[] = [
      new Float32Array([0.1, 0.2, 0.3]), // Time slice 1
      new Float32Array([0.4, 0.5, 0.6]), // Time slice 2
    ];
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: mockData });

    render(<SpectrogramVisualizer />);

    expect(mockCanvasContext.clearRect).toHaveBeenCalled(); // Initial clear
    // Total bins = mockData.length * mockData[0].length = 2 * 3 = 6
    expect(mockCanvasContext.fillRect).toHaveBeenCalledTimes(mockData.length * mockData[0].length);
  });

  it('does not attempt to draw if canvas context cannot be obtained', () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null); // Simulate context failure
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: [[new Float32Array([0.5])]] });
    render(<SpectrogramVisualizer />);
    expect(mockCanvasContext.clearRect).not.toHaveBeenCalled();
    expect(mockCanvasContext.fillRect).not.toHaveBeenCalled();
    HTMLCanvasElement.prototype.getContext = originalGetContext; // Restore original getContext
  });

   it('handles empty frequency bins gracefully', () => {
    const mockDataEmptyBins: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
    usePlayerStore.setState({ isPlayable: true });
    useAnalysisStore.setState({ spectrogramData: mockDataEmptyBins });
    render(<SpectrogramVisualizer />);
    expect(mockCanvasContext.clearRect).toHaveBeenCalled();
    expect(mockCanvasContext.fillText).toHaveBeenCalledWith('No spectrogram data', 150, 75); // Or specific message for empty bins
    expect(mockCanvasContext.fillRect).not.toHaveBeenCalled();
  });
});
