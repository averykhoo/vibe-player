// vibe-player-v2-react/src/types/player.types.ts
// vibe-player-v2/src/lib/types/player.types.ts

/**
 * @interface PlayerState
 * @description Defines the shape of the state for the audio player.
 * This includes information about the current audio file, playback status,
 * processing parameters (speed, pitch, gain), and any errors.
 */
export interface PlayerState {
  /** Current status of the player (e.g., 'idle', 'loading', 'playing', 'paused', 'error'). */
  status: string;
  /** Name of the currently loaded audio file. */
  fileName: string | null;
  /** Total duration of the loaded audio in seconds. */
  duration: number;
  /** Current playback time in seconds. */
  currentTime: number;
  /** True if audio is currently playing, false otherwise. */
  isPlaying: boolean;
  /** True if audio is loaded and ready for playback. */
  isPlayable: boolean;
  /** Current playback speed/rate (e.g., 1.0 for normal, 0.5 for half speed). */
  speed: number;
  /** Current pitch shift in semitones (e.g., 0 for no shift, +12 for one octave up). */
  pitchShift: number;
  /** Current gain/volume level (e.g., 1.0 for normal volume). */
  gain: number;
  /** Optional waveform data for visualization, typically an array of peak values. */
  waveformData?: Float32Array;
  /** Any error message related to player operations. */
  error: string | null;
  /** The decoded AudioBuffer of the current file. Stored for reprocessing or direct use. */
  audioBuffer?: AudioBuffer;
  /** Flag indicating if the AudioContext has been successfully resumed (e.g., after user interaction). */
  audioContextResumed?: boolean;
  /** Number of audio channels in the loaded file. */
  channels?: number;
  /** Sample rate of the loaded audio file. */
  sampleRate?: number;
  /** The last chunk of audio data processed by the audio engine (e.g., after time-stretching/pitch-shifting). */
  lastProcessedChunk?: Float32Array[]; // Array of Float32Arrays for multi-channel audio
}
