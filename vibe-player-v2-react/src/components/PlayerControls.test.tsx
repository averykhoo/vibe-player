// vibe-player-v2-react/src/components/PlayerControls.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PlayerControls from './PlayerControls';
import { usePlayerStore, PlayerState } from '../stores/player.store'; // Import type
// import { useAnalysisStore, AnalysisState } from '../stores/analysis.store'; // Not used in current PlayerControls
import audioEngine from '../services/audioEngine.service';

// Mock services
vi.mock('../services/audioEngine.service', () => ({
  default: {
    play: vi.fn(() => {
      usePlayerStore.setState({ isPlaying: true });
      return Promise.resolve();
    }),
    pause: vi.fn(() => {
      usePlayerStore.setState({ isPlaying: false });
      return Promise.resolve();
    }),
    stop: vi.fn(() => {
      usePlayerStore.setState({ isPlaying: false, currentTime: 0 });
      return Promise.resolve();
    }),
    setSpeed: vi.fn((speed: number) => {
      usePlayerStore.setState({ speed });
      return Promise.resolve();
    }),
    setPitch: vi.fn((pitch: number) => {
      usePlayerStore.setState({ pitchShift: pitch });
      return Promise.resolve();
    }),
    setGain: vi.fn((gain: number) => {
      usePlayerStore.setState({ gain });
      return Promise.resolve();
    }),
    seek: vi.fn((time: number) => {
      usePlayerStore.setState({ currentTime: time });
      return Promise.resolve();
    })
  },
}));

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


describe('PlayerControls', () => {
  beforeEach(() => {
    // Reset player store to a default initial state before each test
    usePlayerStore.setState(initialPlayerState, true);
    vi.clearAllMocks(); // Clear mocks before each test
  });

  it('renders all control labels and sliders/buttons', () => {
    render(<PlayerControls />);
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Seek audio playback position/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Speed:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Pitch:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Gain:/i)).toBeInTheDocument();
  });

  it('calls audioEngine.play when Play button is clicked and not playing', () => {
    usePlayerStore.setState({ isPlayable: true, isPlaying: false });
    render(<PlayerControls />);
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    expect(audioEngine.play).toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('calls audioEngine.pause when Pause button is clicked and playing', () => {
    usePlayerStore.setState({ isPlayable: true, isPlaying: true });
    render(<PlayerControls />);
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(audioEngine.pause).toHaveBeenCalled();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('calls audioEngine.stop when Stop button is clicked', () => {
    usePlayerStore.setState({ isPlayable: true, isPlaying: true });
    render(<PlayerControls />);
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(audioEngine.stop).toHaveBeenCalled();
    const playerState = usePlayerStore.getState();
    expect(playerState.isPlaying).toBe(false);
    expect(playerState.currentTime).toBe(0);
  });

  it('disables controls when not playable', () => {
    usePlayerStore.setState({ isPlayable: false });
    render(<PlayerControls />);
    expect(screen.getByRole('button', { name: /play/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /stop/i })).toBeDisabled();
    expect(screen.getByLabelText(/Seek audio playback position/i)).toBeDisabled();
    expect(screen.getByLabelText(/Speed:/i)).toBeDisabled();
    expect(screen.getByLabelText(/Pitch:/i)).toBeDisabled();
    expect(screen.getByLabelText(/Gain:/i)).toBeDisabled();
  });

  it('updates speed via audioEngine and store when slider changes', () => {
    usePlayerStore.setState({ isPlayable: true, speed: 1.0 });
    render(<PlayerControls />);
    const speedSlider = screen.getByLabelText(/Speed:/i);
    fireEvent.change(speedSlider, { target: { value: '1.5' } });
    expect(audioEngine.setSpeed).toHaveBeenCalledWith(1.5);
    expect(usePlayerStore.getState().speed).toBe(1.5);
  });

  it('updates pitch via audioEngine and store when slider changes', () => {
    usePlayerStore.setState({ isPlayable: true, pitchShift: 0.0 });
    render(<PlayerControls />);
    const pitchSlider = screen.getByLabelText(/Pitch:/i);
    fireEvent.change(pitchSlider, { target: { value: '5.0' } });
    expect(audioEngine.setPitch).toHaveBeenCalledWith(5.0);
    expect(usePlayerStore.getState().pitchShift).toBe(5.0);
  });

  it('updates gain via audioEngine and store when slider changes', () => {
    usePlayerStore.setState({ isPlayable: true, gain: 1.0 });
    render(<PlayerControls />);
    const gainSlider = screen.getByLabelText(/Gain:/i);
    fireEvent.change(gainSlider, { target: { value: '0.75' } });
    expect(audioEngine.setGain).toHaveBeenCalledWith(0.75);
    expect(usePlayerStore.getState().gain).toBe(0.75);
  });

  it('updates currentTime via audioEngine and store when seek slider changes', () => {
    usePlayerStore.setState({ isPlayable: true, duration: 100, currentTime: 0 });
    render(<PlayerControls />);
    const seekSlider = screen.getByLabelText(/Seek audio playback position/i);
    fireEvent.change(seekSlider, { target: { value: '50.5' } });
    expect(audioEngine.seek).toHaveBeenCalledWith(50.5);
    expect(usePlayerStore.getState().currentTime).toBe(50.5);
  });
});
