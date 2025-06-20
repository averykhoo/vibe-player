import React, { useCallback, useEffect, useState } from 'react';
import { usePlayerStore } from '../stores/player.store';
import audioEngine from '../services/audioEngine.service';
// Note: PlayerState type is not directly used for setState in this component,
// as direct calls to audioEngine handle state updates which reflect back through the store.

/**
 * @component PlayerControls
 * @description Provides UI controls for audio playback, including play/pause, stop,
 * speed, pitch, and gain adjustments. It interacts with the `audioEngine` service
 * and reflects state from the `usePlayerStore`.
 */
const PlayerControls: React.FC = () => {
  // Subscribe to specific parts of the player store
  const isPlaying = usePlayerStore(useCallback((state) => state.isPlaying, []));
  const isPlayable = usePlayerStore(useCallback((state) => state.isPlayable, []));
  const storeSpeed = usePlayerStore(useCallback((state) => state.speed, []));
  const storePitchShift = usePlayerStore(useCallback((state) => state.pitchShift, []));
  const storeGain = usePlayerStore(useCallback((state) => state.gain, []));
  const currentTime = usePlayerStore(useCallback((state) => state.currentTime, []));
  const duration = usePlayerStore(useCallback((state) => state.duration, []));

  // Local state for sliders to provide immediate feedback, synced with store
  const [currentSpeed, setCurrentSpeed] = useState(storeSpeed);
  const [currentPitch, setCurrentPitch] = useState(storePitchShift);
  const [currentGain, setCurrentGain] = useState(storeGain);

  useEffect(() => {
    setCurrentSpeed(storeSpeed);
  }, [storeSpeed]);

  useEffect(() => {
    setCurrentPitch(storePitchShift);
  }, [storePitchShift]);

  useEffect(() => {
    setCurrentGain(storeGain);
  }, [storeGain]);

  /**
   * Toggles playback between play and pause states.
   */
  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play().catch(error => console.error("Error playing audio:", error));
    }
  }, [isPlaying]);

  /**
   * Stops audio playback.
   */
  const handleStop = useCallback(() => {
    audioEngine.stop().catch(error => console.error("Error stopping audio:", error));
  }, []);

  /**
   * Handles changes to the speed slider.
   * Updates local state for responsiveness and calls the audioEngine.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = parseFloat(e.target.value);
    setCurrentSpeed(newSpeed);
    audioEngine.setSpeed(newSpeed);
  }, []);

  /**
   * Handles changes to the pitch slider.
   * Updates local state and calls the audioEngine.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handlePitchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newPitch = parseFloat(e.target.value);
    setCurrentPitch(newPitch);
    audioEngine.setPitch(newPitch); // Note: audioEngine.setPitch expects semitones
  }, []);

  /**
   * Handles changes to the gain slider.
   * Updates local state and calls the audioEngine.
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handleGainChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newGain = parseFloat(e.target.value);
    setCurrentGain(newGain);
    audioEngine.setGain(newGain);
  }, []);

  /**
   * Handles changes to the seek slider (playback position).
   * @param {React.ChangeEvent<HTMLInputElement>} e - The input change event.
   */
  const handleSeekChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    // Update store directly for immediate feedback while scrubbing
    usePlayerStore.setState({ currentTime: newTime });
    audioEngine.seek(newTime).catch(error => console.error("Error seeking audio:", error));
  }, []);


  /**
   * Formats time in seconds to a string "MM:SS".
   * @param {number} totalSeconds - The time in seconds.
   * @returns {string} The formatted time string.
   */
  const formatTime = (totalSeconds: number): string => {
    if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };


  return (
    <div className="p-4 border rounded-lg shadow-sm space-y-4 bg-gray-50 dark:bg-gray-800">
      {/* Playback Buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handlePlayPause}
          disabled={!isPlayable}
          className="px-4 py-2 font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-gray-500 transition-colors duration-150 ease-in-out"
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={handleStop}
          disabled={!isPlayable}
          className="px-4 py-2 font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed dark:bg-red-500 dark:hover:bg-red-600 dark:disabled:bg-gray-500 transition-colors duration-150 ease-in-out"
          aria-label="Stop audio"
        >
          Stop
        </button>
      </div>

      {/* Seek Slider */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
        <input
          type="range"
          id="seek-slider"
          min="0"
          max={duration || 0} // Ensure max is at least 0
          step="0.1"
          value={currentTime}
          onChange={handleSeekChange}
          disabled={!isPlayable}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Seek audio playback position"
        />
      </div>

      {/* Control Sliders Group */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Speed Slider */}
        <div className="space-y-1">
          <label htmlFor="speed-slider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Speed: {currentSpeed.toFixed(2)}x
          </label>
          <input
            type="range"
            id="speed-slider"
            min="0.5"
            max="2.0"
            step="0.01"
            value={currentSpeed}
            onChange={handleSpeedChange}
            disabled={!isPlayable}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Adjust playback speed"
          />
        </div>

        {/* Pitch Slider */}
        <div className="space-y-1">
          <label htmlFor="pitch-slider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Pitch: {currentPitch.toFixed(1)}
          </label>
          <input
            type="range"
            id="pitch-slider"
            min="-12" // Semitones, e.g., -12 to +12
            max="12"
            step="0.1"
            value={currentPitch}
            onChange={handlePitchChange}
            disabled={!isPlayable}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Adjust playback pitch"
          />
        </div>

        {/* Gain Slider */}
        <div className="space-y-1">
          <label htmlFor="gain-slider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Gain: {currentGain.toFixed(2)}
          </label>
          <input
            type="range"
            id="gain-slider"
            min="0"
            max="3.0" // Assuming MAX_GAIN from constants is 3.0
            step="0.01"
            value={currentGain}
            onChange={handleGainChange}
            disabled={!isPlayable}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Adjust playback gain"
          />
        </div>
      </div>
    </div>
  );
};

export default PlayerControls;
