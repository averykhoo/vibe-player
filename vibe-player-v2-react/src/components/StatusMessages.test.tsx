// vibe-player-v2-react/src/components/StatusMessages.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import StatusMessages from './StatusMessages';
import { useStatusStore } from '../stores/status.store';

const initialStatusState = useStatusStore.getState();

describe('StatusMessages', () => {
  beforeEach(() => {
    useStatusStore.setState(initialStatusState, true); // Reset store before each test
  });

  it('renders nothing when no message and not loading', () => {
    useStatusStore.setState({ message: null, isLoading: false, type: null, details: null, progress: null });
    const { container } = render(<StatusMessages />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when message is "Ready" and not loading', () => {
    useStatusStore.setState({ message: 'Ready', isLoading: false, type: 'success', details: null, progress: null });
    const { container } = render(<StatusMessages />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading message with progress', () => {
    useStatusStore.setState({ isLoading: true, message: 'Loading file data...', progress: 0.75 });
    render(<StatusMessages />);
    expect(screen.getByText('Loading file data...')).toBeInTheDocument();

    // Check for the progress bar visually by its style
    // This requires jest-dom's toHaveStyle matcher.
    // Ensure your Vitest setup includes jest-dom for this: `setupFiles: ['./src/setupTests.ts']` in vite.config.ts
    // and `import '@testing-library/jest-dom'` in setupTests.ts.
    const progressBarContainer = screen.getByText('Loading file data...').nextSibling; // The div containing the bar
    expect(progressBarContainer).toBeInTheDocument();
    if (progressBarContainer) {
      const progressBar = progressBarContainer.firstChild as HTMLElement; // The actual bar element
      expect(progressBar).toBeInTheDocument();
      // Check style directly if jest-dom toHaveStyle is not available/working
      // expect(progressBar.style.width).toBe('75%');
      // Using toHaveAttribute for broader compatibility if style isn't parsed easily by JSDOM
      expect(progressBar).toHaveAttribute('style', expect.stringContaining('width: 75%'));
    }
  });

  it('renders error message with details', () => {
    useStatusStore.setState({ isLoading: false, type: 'error', message: 'A Big Error Occurred', details: 'Extra details here' });
    render(<StatusMessages />);
    expect(screen.getByText(/Error: A Big Error Occurred/i)).toBeInTheDocument();
    expect(screen.getByText(/Details: Extra details here/i)).toBeInTheDocument();
  });

  it('renders success message (if not "Ready")', () => {
    useStatusStore.setState({ isLoading: false, type: 'success', message: 'Operation Successful!' });
    render(<StatusMessages />);
    expect(screen.getByText('Operation Successful!')).toBeInTheDocument();
  });

  it('renders info message (if not "Ready")', () => {
    useStatusStore.setState({ isLoading: false, type: 'info', message: 'Some informational update.' });
    render(<StatusMessages />);
    expect(screen.getByText('Some informational update.')).toBeInTheDocument();
  });
});
