import React, { useEffect } from 'react';
import './App.css'; // Keep or remove if not used beyond index.css imports

// Services for lifecycle
import { audioOrchestrator } from './services/AudioOrchestrator.service'; // Use the exported instance
import audioEngine from './services/audioEngine.service';
import analysisService from './services/analysis.service';
import dtmfService from './services/dtmf.service';
import spectrogramService from './services/spectrogram.service';

// UI Components
import FileLoader from './components/FileLoader';
import PlayerControls from './components/PlayerControls';
import WaveformVisualizer from './components/WaveformVisualizer';
import SpectrogramVisualizer from './components/SpectrogramVisualizer';
import ToneDisplay from './components/ToneDisplay';
import StatusMessages from './components/StatusMessages';

/**
 * @component App
 * @description Main application component.
 * Handles the overall layout of UI components and manages the lifecycle of core audio services.
 */
const App: React.FC = () => {
  /**
   * useEffect hook for application lifecycle management.
   * Initializes services on component mount and disposes of them on unmount.
   * Runs only once due to the empty dependency array.
   */
  useEffect(() => {
    console.log('[App] Component did mount. Initializing services...');

    // Initialize services that require setup
    // AudioOrchestrator is a singleton, getInstance is called internally or when imported.
    audioOrchestrator.setupUrlSerialization();

    // Placeholder for any other one-time initializations for services if needed.
    // For example, some services might need an explicit init() if not handled by orchestrator.
    // However, in the current design, AudioOrchestrator handles initialization of other services like
    // dtmfService.initialize() and spectrogramService.initialize() after a file is loaded.
    // audioEngine.unlockAudio() is also typically called upon user interaction or file load.

    // Return a cleanup function to be executed on component unmount
    return () => {
      console.log('[App] Component will unmount. Disposing services...');
      audioEngine.dispose();
      console.log('[App] AudioEngine disposed.');

      if (analysisService && typeof analysisService.dispose === 'function') {
        analysisService.dispose();
        console.log('[App] AnalysisService disposed.');
      }
      if (dtmfService && typeof dtmfService.dispose === 'function') {
        dtmfService.dispose();
        console.log('[App] DtmfService disposed.');
      }
      if (spectrogramService && typeof spectrogramService.dispose === 'function') {
        spectrogramService.dispose();
        console.log('[App] SpectrogramService disposed.');
      }
      // If AudioOrchestrator had a dispose method, it would be called here.
      // e.g., audioOrchestrator.dispose();
      console.log('[App] All specified services disposed.');
    };
  }, []); // Empty dependency array ensures this runs only once on mount and unmount

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 p-4 sm:p-6 md:p-8 flex flex-col items-center selection:bg-blue-500 selection:text-white">
      {/* StatusMessages is typically positioned absolutely/fixed, so its place in JSX order here is flexible. */}
      <StatusMessages />

      <div className="w-full max-w-5xl space-y-6">
        <header className="text-center mb-6">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
            Vibe Player <span className="text-blue-600 dark:text-blue-500">V2</span>
          </h1>
          <p className="mt-3 text-lg leading-8 text-gray-600 dark:text-gray-300 sm:mt-4">
            React Edition
          </p>
        </header>

        <main className="space-y-6">
          <section aria-labelledby="file-loader-heading">
            <h2 id="file-loader-heading" className="sr-only">File Loader</h2>
            <FileLoader />
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section aria-labelledby="waveform-heading" className="min-w-0"> {/* min-w-0 for flex/grid child overflow */}
              <h2 id="waveform-heading" className="text-xl font-semibold mb-2 dark:text-gray-100">Waveform</h2>
              <WaveformVisualizer />
            </section>
            <section aria-labelledby="spectrogram-heading" className="min-w-0">
              <h2 id="spectrogram-heading" className="text-xl font-semibold mb-2 dark:text-gray-100">Spectrogram</h2>
              <SpectrogramVisualizer />
            </section>
          </div>

          <section aria-labelledby="player-controls-heading">
            <h2 id="player-controls-heading" className="sr-only">Player Controls</h2>
            <PlayerControls />
          </section>

          <section aria-labelledby="tone-display-heading">
             <h2 id="tone-display-heading" className="sr-only">Tone Display</h2>
            <ToneDisplay />
          </section>
        </main>

        <footer className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>&copy; {new Date().getFullYear()} Vibe Player Project. All Rights Reserved.</p>
        </footer>
      </div>
    </div>
  );
};

export default App;
