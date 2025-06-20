// vibe-player-v2-react/src/components/PlayerControls.tsx
import audioEngine from '../services/audioEngine.service';
// import analysisService from '../services/analysis.service'; // Not called directly for VAD from here yet
import { usePlayerStore } from '../stores/player.store';
import { useAnalysisStore } from '../stores/analysis.store';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';

export default function PlayerControls() {
  const { isPlayable, isPlaying, speed, pitchShift, gain } = usePlayerStore(state => ({
    isPlayable: state.isPlayable,
    isPlaying: state.isPlaying,
    speed: state.speed,
    pitchShift: state.pitchShift,
    gain: state.gain,
  }));

  const { vadPositiveThreshold, vadNegativeThreshold } = useAnalysisStore(state => ({
    vadPositiveThreshold: state.vadPositiveThreshold,
    vadNegativeThreshold: state.vadNegativeThreshold,
  }));

  const handlePlayPause = () => {
    if (isPlaying) {
      audioEngine.pause();
      usePlayerStore.setState({ isPlaying: false }); // Reflect state immediately
    } else {
      audioEngine.play();
      usePlayerStore.setState({ isPlaying: true }); // Reflect state immediately
    }
  };

  const handleStop = () => {
    audioEngine.stop();
    usePlayerStore.setState({ isPlaying: false, currentTime: 0 }); // Reflect state immediately
  };

  const handleSpeedChange = (value: number[]) => {
    const newSpeed = value[0];
    usePlayerStore.setState({ speed: newSpeed });
    audioEngine.setSpeed(newSpeed);
  };

  const handlePitchChange = (value: number[]) => {
    const newPitch = value[0];
    usePlayerStore.setState({ pitchShift: newPitch });
    audioEngine.setPitch(newPitch);
  };

  const handleGainChange = (value: number[]) => {
    const newGain = value[0];
    usePlayerStore.setState({ gain: newGain });
    audioEngine.setGain(newGain);
  };

  const handleVadPositiveChange = (value: number[]) => {
    const newThreshold = value[0];
    useAnalysisStore.setState({ vadPositiveThreshold: newThreshold });
    // console.log(`[Controls] VAD Positive Threshold set to: ${newThreshold.toFixed(2)}`);
    // If analysisService needs re-initialization or update, it would be called here.
    // e.g., analysisService.initialize({ positiveThreshold: newThreshold, negativeThreshold: vadNegativeThreshold });
    // For now, just updating store as per Svelte's direct store binding behavior.
  };

  const handleVadNegativeChange = (value: number[]) => {
    const newThreshold = value[0];
    useAnalysisStore.setState({ vadNegativeThreshold: newThreshold });
    // console.log(`[Controls] VAD Negative Threshold set to: ${newThreshold.toFixed(2)}`);
    // e.g., analysisService.initialize({ positiveThreshold: vadPositiveThreshold, negativeThreshold: newThreshold });
  };

  return (
    <div className="space-y-4"> {/* Removed card for now */}
      <h3 className="text-xl font-semibold">Controls</h3>
      <div className="flex space-x-2">
        <Button
          data-testid="play-button"
          onClick={handlePlayPause}
          disabled={!isPlayable}
          variant="outline"
        >
          {isPlaying ? 'Pause' : 'Play'}
        </Button>
        <Button
          data-testid="stop-button"
          onClick={handleStop}
          disabled={!isPlayable}
          variant="outline"
        >
          Stop
        </Button>
      </div>

      <div>
        <Label htmlFor="speedSlider" data-testid="speed-value">
          Speed: {speed.toFixed(2)}x
        </Label>
        <Slider
          id="speedSlider"
          data-testid="speed-slider-input"
          value={[speed]}
          min={0.5}
          max={2.0}
          step={0.01}
          onValueChange={handleSpeedChange} // Changed from onInput to onValueChange for Shadcn Slider
          disabled={!isPlayable}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="pitchSlider" data-testid="pitch-value">
          Pitch: {pitchShift.toFixed(1)} semitones
        </Label>
        <Slider
          id="pitchSlider"
          data-testid="pitch-slider-input"
          value={[pitchShift]}
          min={-12}
          max={12}
          step={0.1}
          onValueChange={handlePitchChange}
          disabled={!isPlayable}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="gainSlider" data-testid="gain-value">
          Gain: {gain.toFixed(2)}
        </Label>
        <Slider
          id="gainSlider"
          data-testid="gain-slider-input"
          value={[gain]}
          min={0}
          max={2.0}
          step={0.01}
          onValueChange={handleGainChange}
          disabled={!isPlayable}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="vadPositiveSlider" data-testid="vad-positive-value">
          VAD Positive Threshold: {vadPositiveThreshold?.toFixed(2) ?? 'N/A'}
        </Label>
        <Slider
          id="vadPositiveSlider"
          data-testid="vad-positive-slider-input"
          value={[vadPositiveThreshold ?? 0.5]} // Provide default if undefined for slider
          min={0.05}
          max={0.95}
          step={0.01}
          onValueChange={handleVadPositiveChange}
          className="mt-1"
          // Consider if this should be disabled if VAD is not initialized / !isPlayable
        />
      </div>

      <div>
        <Label htmlFor="vadNegativeSlider" data-testid="vad-negative-value">
          VAD Negative Threshold: {vadNegativeThreshold?.toFixed(2) ?? 'N/A'}
        </Label>
        <Slider
          id="vadNegativeSlider"
          data-testid="vad-negative-slider-input"
          value={[vadNegativeThreshold ?? 0.35]} // Provide default if undefined
          min={0.05}
          max={0.95}
          step={0.01}
          onValueChange={handleVadNegativeChange}
          className="mt-1"
          // Consider if this should be disabled
        />
      </div>
    </div>
  );
}
