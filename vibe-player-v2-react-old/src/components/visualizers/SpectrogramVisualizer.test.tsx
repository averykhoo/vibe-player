// vibe-player-v2-react/src/components/visualizers/SpectrogramVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import SpectrogramVisualizer from './SpectrogramVisualizer';
import { useAnalysisStore, type AnalysisState } from '../../stores/analysis.store'; // Import type
import * as dspUtils from '../../utils/dsp'; // For spying on viridisColor

// Mock ResizeObserver (can be in a setup file if used by many tests)
const mockObserveSpec = vi.fn();
const mockUnobserveSpec = vi.fn();
const mockDisconnectSpec = vi.fn();

// Ensure ResizeObserver is mocked *before* WaveformVisualizer is imported or rendered if not using vi.hoisted
// For stubGlobal, it should be fine.
vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: mockObserveSpec,
  unobserve: mockUnobserveSpec,
  disconnect: mockDisconnectSpec,
})));

// Spy on viridisColor
const viridisSpy = vi.spyOn(dspUtils, 'viridisColor');

const initialAnalysisState: AnalysisState = useAnalysisStore.getState();

describe('SpectrogramVisualizer', () => {
  beforeEach(() => {
    useAnalysisStore.setState(initialAnalysisState, true);
    mockObserveSpec.mockClear();
    mockUnobserveSpec.mockClear();
    mockDisconnectSpec.mockClear();
    viridisSpy.mockClear().mockImplementation(() => [0,0,0]); // Provide a default mock implementation for viridis
  });

  it('renders a canvas element', () => {
    render(<SpectrogramVisualizer />);
    const canvas = screen.getByTestId('spectrogram-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('observes canvas with ResizeObserver on mount and unobserves on unmount', () => {
    const { unmount } = render(<SpectrogramVisualizer />);
    expect(mockObserveSpec).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockUnobserveSpec).toHaveBeenCalledTimes(1);
  });

  it('calls viridisColor when spectrogramData is present', () => {
    // Mock getContext to allow drawing logic to proceed
    const mockGetContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
    }));
    HTMLCanvasElement.prototype.getContext = mockGetContext;

    // Create some mock spectrogram data (1 frame, 2 bins)
    const mockData: Float32Array[][] = [[new Float32Array([0.5, 0.8])]];
    useAnalysisStore.setState({ spectrogramData: mockData });

    render(<SpectrogramVisualizer />);

    expect(mockGetContext).toHaveBeenCalledWith('2d');
    const context2d = mockGetContext.mock.results[0].value;
    expect(context2d.clearRect).toHaveBeenCalled();
    expect(context2d.fillRect).toHaveBeenCalledTimes(mockData[0].length); // Called for each bin
    expect(viridisSpy).toHaveBeenCalledTimes(mockData[0].length);
  });

  it('does not call viridisColor if spectrogramData is null or empty', () => {
    const mockGetContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
    }));
    HTMLCanvasElement.prototype.getContext = mockGetContext;

    useAnalysisStore.setState({ spectrogramData: null });
    render(<SpectrogramVisualizer />);

    const context2d = mockGetContext.mock.results[0]?.value;
    if (context2d) {
        expect(context2d.fillRect).not.toHaveBeenCalled();
    }
    expect(viridisSpy).not.toHaveBeenCalled();
  });
});
