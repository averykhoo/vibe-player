// vibe-player-v2-react/src/App.tsx
import { useEffect } from 'react';
import { audioOrchestrator } from './services/AudioOrchestrator.service';
import audioEngine from './services/audioEngine.service'; // Instance from AudioEngineService
import analysisService from './services/analysis.service';
import dtmfService from './services/dtmf.service';
import spectrogramService from './services/spectrogram.service';

// Placeholder imports for Shadcn UI components that will be used in the layout
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"; // Example

// Placeholder for future UI components - these will be created in later steps
import FileLoader from './components/FileLoader';
import PlayerControls from './components/PlayerControls';
import WaveformVisualizer from './components/visualizers/WaveformVisualizer';
import SpectrogramVisualizer from './components/visualizers/SpectrogramVisualizer';
import ToneDisplay from './components/ToneDisplay';
import StatusMessages from './components/StatusMessages';

function App() {
  useEffect(() => {
    console.log('[App.tsx] onMount: Initializing services.');
    audioOrchestrator.setupUrlSerialization();

    // Cleanup function to dispose services on component unmount
    return () => {
      console.log('[App.tsx] onDestroy: Disposing all services...');
      audioEngine.dispose();
      analysisService.dispose();
      dtmfService.dispose();
      spectrogramService.dispose();
      console.log('[App.tsx] onDestroy: All services disposed.');
    };
  }, []); // Empty dependency array ensures this runs only once on mount and cleans up on unmount

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center p-4 space-y-4">
      <header className="w-full max-w-4xl">
        <h1 className="text-3xl font-bold text-center">Vibe Player V2 - React Edition</h1>
      </header>

      <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1: File Loader & Status */}
        <section className="md:col-span-1 space-y-4">
          {/* <Card> */}
          {/*   <CardHeader><CardTitle>Load Audio</CardTitle></CardHeader> */}
          {/*   <CardContent> */}
          <div className="bg-card p-4 rounded-lg shadow"> {/* Using card-like bg */}
            {/* <CardHeader><CardTitle>Load Audio</CardTitle></CardHeader> */}
            {/* <CardContent> */}
            <FileLoader />
            {/* </CardContent> */}
          </div>

          {/* <Card> */}
          {/*   <CardHeader><CardTitle>Status</CardTitle></CardHeader> */}
          {/*   <CardContent> */}
          <div className="bg-card p-4 rounded-lg shadow"> {/* Using card-like bg */}
            {/* <CardHeader><CardTitle>Status</CardTitle></CardHeader> */}
            {/* <CardContent> */}
            <StatusMessages />
            {/* </CardContent> */}
          </div>
        </section>

        {/* Column 2: Controls & Visualizers */}
        <section className="md:col-span-2 space-y-4">
          <div className="bg-card p-4 rounded-lg shadow"> {/* Using card-like bg */}
            {/* <CardHeader><CardTitle>Controls</CardTitle></CardHeader> */}
            {/* <CardContent> */}
            <PlayerControls />
            {/* </CardContent> */}
          </div>

          {/* Using a div that controls aspect ratio or height for the canvas */}
          <div className="bg-card p-2 rounded-lg shadow h-40"> {/* Reduced padding, ensure canvas takes space */}
            {/* <CardHeader><CardTitle>Waveform</CardTitle></CardHeader> */}
            {/* <CardContent className="p-0"> Need to ensure CardContent doesn't add padding if canvas is direct child */}
            <WaveformVisualizer />
            {/* </CardContent> */}
          </div>

          {/* Using a div that controls aspect ratio or height for the canvas */}
          <div className="bg-card p-2 rounded-lg shadow h-60"> {/* Reduced padding */}
            {/* <CardHeader><CardTitle>Spectrogram</CardTitle></CardHeader> */}
            {/* <CardContent className="p-0"> */}
            <SpectrogramVisualizer />
            {/* </CardContent> */}
          </div>
        </section>

        {/* Optional: DTMF/Tone Display Area - can be part of another section or its own */}
        <section className="md:col-span-3 space-y-4">
          <div className="bg-card p-4 rounded-lg shadow"> {/* Using card-like bg */}
            {/* <CardHeader><CardTitle>Detected Tones (DTMF/CPT)</CardTitle></CardHeader> */}
            {/* <CardContent> */}
            <ToneDisplay />
            {/* </CardContent> */}
          </div>
        </section>
      </main>

      <footer className="w-full max-w-4xl text-center mt-8">
        <p className="text-sm text-muted-foreground">Vibe Player V2 - React Edition. &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}

export default App;
