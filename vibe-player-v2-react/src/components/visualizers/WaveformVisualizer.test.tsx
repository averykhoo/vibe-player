// vibe-player-v2-react/src/components/visualizers/WaveformVisualizer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import WaveformVisualizer from './WaveformVisualizer';
import { usePlayerStore, type PlayerState } from '../../stores/player.store'; // Import type

// Mock ResizeObserver
const mockObserve = vi.fn();
const mockUnobserve = vi.fn();
const mockDisconnect = vi.fn();

vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: mockObserve,
  unobserve: mockUnobserve,
  disconnect: mockDisconnect, // Include disconnect for completeness
})));

const initialPlayerState: PlayerState = usePlayerStore.getState();

describe('WaveformVisualizer', () => {
  beforeEach(() => {
    usePlayerStore.setState(initialPlayerState, true);
    mockObserve.mockClear();
    mockUnobserve.mockClear();
    mockDisconnect.mockClear();
  });

  it('renders a canvas element', () => {
    render(<WaveformVisualizer />);
    const canvas = screen.getByTestId('waveform-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('observes canvas with ResizeObserver on mount and unobserves on unmount', () => {
    const { unmount } = render(<WaveformVisualizer />);
    expect(mockObserve).toHaveBeenCalledTimes(1);

    unmount();
    expect(mockUnobserve).toHaveBeenCalledTimes(1);
  });

  it('attempts to draw when waveformData is present', () => {
    // Mock getContext to allow drawing logic to proceed to a certain point
    const mockGetContext = vi.fn(() => ({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      // Add other methods if draw logic becomes more complex
    }));
    HTMLCanvasElement.prototype.getContext = mockGetContext;

    const mockData: Float32Array[][] = [[new Float32Array([0.1, -0.1, 0.2])]];
    usePlayerStore.setState({ waveformData: mockData });

    render(<WaveformVisualizer />);

    expect(mockGetContext).toHaveBeenCalledWith('2d');
    // Check if drawing methods were called (implies draw function was executed)
    const context2d = mockGetContext.mock.results[0].value;
    expect(context2d.clearRect).toHaveBeenCalled();
    expect(context2d.beginPath).toHaveBeenCalled();
    expect(context2d.stroke).toHaveBeenCalled();

    // Restore original getContext if necessary, or ensure it's mocked per test
    // delete (HTMLCanvasElement.prototype as any).getContext; // Not standard, better to manage mocks carefully
  });

  it('does not attempt to draw if waveformData is null or empty', () => {
    const mockGetContext = vi.fn(() => ({
      clearRect: vi.fn(), // ClearRect might still be called
      beginPath: vi.fn(),
      stroke: vi.fn(),
    }));
    HTMLCanvasElement.prototype.getContext = mockGetContext;

    usePlayerStore.setState({ waveformData: undefined });
    render(<WaveformVisualizer />);

    const context2d = mockGetContext.mock.results[0]?.value;
    if (context2d) { // context might not be retrieved if canvas isn't found or no data
        expect(context2d.beginPath).not.toHaveBeenCalled();
        expect(context2d.stroke).not.toHaveBeenCalled();
    } else {
        // If context is not even called, that's also a pass for "not attempting to draw"
        expect(mockGetContext).not.toHaveBeenCalled();
    }
  });
});
