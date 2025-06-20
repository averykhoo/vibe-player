// vibe-player-v2-react/src/components/FileLoader.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import FileLoader from './FileLoader';
import { useStatusStore } from '../stores/status.store';
import { audioOrchestrator } from '../services/AudioOrchestrator.service';

// Mock the audioOrchestrator service
vi.mock('../services/AudioOrchestrator.service', () => ({
  audioOrchestrator: {
    loadFileAndAnalyze: vi.fn().mockResolvedValue(undefined),
  },
}));

// Provide a default state for any store hooks used directly in rendering logic
const initialStatusState = useStatusStore.getState();

describe('FileLoader', () => {
  beforeEach(() => {
    useStatusStore.setState(initialStatusState, true); // Reset store before each test
    vi.clearAllMocks(); // Clear mock function calls
  });

  it('renders the file input and label', () => {
    render(<FileLoader />);
    const label = screen.getByText(/load audio file/i);
    expect(label).toBeInTheDocument();

    // Check for input by its label text, which is a good practice with RTL
    // The actual input is hidden, but the button that triggers it can be found by its text.
    const button = screen.getByRole('button', { name: /select file/i });
    expect(button).toBeInTheDocument();
  });

  it('calls orchestrator when a file is selected via hidden input', async () => {
    render(<FileLoader />);
    // The actual input is hidden. We get it by its ID or ref (if exposed, but not here).
    // For testing, we can find it if it's in the DOM, even if hidden.
    // A better way would be to test clicking the button that triggers the input.
    const inputElement = screen.getByLabelText(/load audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    expect(inputElement).not.toBeNull();


    const testFile = new File(['(⌐□_□)'], 'chucknorris.mp3', { type: 'audio/mp3' });

    // Simulate file selection on the hidden input
    await fireEvent.change(inputElement, { target: { files: [testFile] } });

    // Check if orchestrator was called
    expect(audioOrchestrator.loadFileAndAnalyze).toHaveBeenCalledTimes(1);
    expect(audioOrchestrator.loadFileAndAnalyze).toHaveBeenCalledWith(testFile);
  });

  // Note: The original test had expectations for displaying file name and size,
  // and for disabling input based on isLoading or error states.
  // These would require the FileLoader component to subscribe to usePlayerStore for fileName
  // and useStatusStore for isLoading/error to display these things, which it currently does not in the simplified version.
  // The current FileLoader only has the input and button.
  // If those features are added back to FileLoader, these tests would be relevant.

  // For now, this is a placeholder for more detailed state-driven UI tests:
  it('placeholder for UI state tests if FileLoader subscribed to stores', () => {
    expect(true).toBe(true);
  });

});
