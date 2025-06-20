// vibe-player-v2-react/src/components/FileLoader.tsx
import { ChangeEvent, useRef, useState } from 'react';
import { audioOrchestrator } from '../services/AudioOrchestrator.service';
import { useStatusStore } from '../stores/status.store';
import { Label } from '@/components/ui/label'; // Shadcn UI
import { Input } from '@/components/ui/input'; // Shadcn UI
// Potentially Button from '@/components/ui/button' if we change the input styling

export default function FileLoader() {
  const { isLoading, message: statusMessage, type: statusType, details: statusDetails, progress } = useStatusStore(state => ({
    isLoading: state.isLoading,
    message: state.message,
    type: state.type,
    details: state.details,
    progress: state.progress,
  }));

  const [selectedFileDisplay, setSelectedFileDisplay] = useState<{ name: string; size: number } | null>(null);
  const [isInputDisabled, setIsInputDisabled] = useState(false); // Local disable state during async operation
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setSelectedFileDisplay({ name: file.name, size: file.size });
      console.log(`[FileLoader] User selected file: '${file.name}'. Calling AudioOrchestrator.loadFileAndAnalyze.`);

      setIsInputDisabled(true); // Disable input immediately
      // statusStore updates will be handled by audioOrchestrator

      try {
        await audioOrchestrator.loadFileAndAnalyze(file);
        console.log(`[FileLoader] AudioOrchestrator.loadFileAndAnalyze promise resolved for ${file.name}.`);
      } catch (e: any) {
        // This catch is a safety net. Orchestrator should set error state in statusStore.
        console.error('[FileLoader] Orchestrator.loadFileAndAnalyze threw or promise rejected:', e);
        // If statusStore wasn't updated by orchestrator on error, set a generic message
        // This check might be redundant if orchestrator always updates statusStore on error.
        if (useStatusStore.getState().type !== 'error') {
          useStatusStore.setState({
            message: `File processing failed: ${e.message || 'Unknown error'}`,
            type: 'error',
            isLoading: false,
            details: e.stack,
            progress: null
          });
        }
      } finally {
        setIsInputDisabled(false);
        // Clear the file input so the same file can be re-selected
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        // Optionally clear selection display after processing, or keep it
        // setSelectedFileDisplay(null);
      }
    }
  };

  const effectiveIsDisabled = isLoading || isInputDisabled;

  return (
    <div className="space-y-2"> {/* Removed card for now, can be added in App.tsx if structure demands */}
      <Label htmlFor="fileInput" className="text-lg font-semibold cursor-pointer">
        Load Audio File
      </Label>
      <Input
        type="file"
        id="fileInput"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept="audio/*"
        disabled={effectiveIsDisabled}
        className="block w-full text-sm text-slate-500
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-full file:border-0
                   file:text-sm file:font-semibold
                   file:bg-primary file:text-primary-foreground
                   hover:file:bg-primary/90
                   disabled:opacity-50 disabled:cursor-not-allowed"
      />

      {selectedFileDisplay && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Selected: {selectedFileDisplay.name} ({(selectedFileDisplay.size / 1024 / 1024).toFixed(2)} MB)
        </p>
      )}

      {/* Display messages from statusStore */}
      {isLoading && (
        <p data-testid="file-loading-message" className="text-sm text-blue-500">
          {statusMessage || 'Loading audio...'}
          {typeof progress === 'number' && ` (${(progress * 100).toFixed(0)}%)`}
        </p>
      )}

      {!isLoading && statusType === 'error' && statusMessage && (
        <p data-testid="file-error-message" className="mt-2 text-sm text-red-500">
          Error: {statusMessage}
          {statusDetails && <span className="block text-xs"><br />Details: {statusDetails}</span>}
        </p>
      )}

      {!isLoading && statusType === 'success' && statusMessage && statusMessage !== 'Ready' && (
        <p data-testid="file-success-message" className="mt-2 text-sm text-green-500">
          {statusMessage}
        </p>
      )}
    </div>
  );
}
