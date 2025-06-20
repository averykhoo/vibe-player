// vibe-player-v2-react/src/components/StatusMessages.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import StatusMessages from './StatusMessages';
import { useStatusStore, StatusState } from '../stores/status.store'; // Import type

// Get initial state once
const initialStatusState = useStatusStore.getState();

describe('StatusMessages', () => {
  // Spy on clearStatus action
  const clearStatusSpy = vi.fn();

  beforeEach(() => {
    // Reset store to initial state before each test
    useStatusStore.setState(initialStatusState, true);
    // Reset spy and provide the spy implementation for clearStatus
    clearStatusSpy.mockReset();
    useStatusStore.setState({ clearStatus: clearStatusSpy });
  });

  it('renders nothing when no message and not loading', () => {
    // State is already reset in beforeEach
    const { container } = render(<StatusMessages />);
    expect(container.firstChild).toBeNull();
  });

  it('renders loading message without progress', () => {
    useStatusStore.setState({ isLoading: true, message: 'Loading file...', type: 'loading' });
    render(<StatusMessages />);
    expect(screen.getByText('Loading file...')).toBeInTheDocument();
    expect(screen.getByText(/loading, please wait\.\.\./i)).toBeInTheDocument();
    // Dismiss button should not be there for simple loading message without progress
    expect(screen.queryByLabelText(/dismiss message/i)).toBeNull();
  });

  it('renders loading message with progress bar', () => {
    useStatusStore.setState({ isLoading: true, message: 'Processing...', type: 'loading', progress: 75 });
    render(<StatusMessages />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();

    const progressBar = screen.getByRole('progressbar'); // Assuming progressbar role is on the div
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute('aria-valuenow', '75');
    expect(progressBar).toHaveStyle('width: 75%');
    expect(screen.getByText(/75%/i)).toBeInTheDocument(); // Percentage text

    // Dismiss button should be there for loading message with progress
    expect(screen.getByLabelText(/dismiss message/i)).toBeInTheDocument();
  });

  it('renders error message with details and is dismissible', () => {
    useStatusStore.setState({
      isLoading: false,
      type: 'error',
      message: 'A Big Error Occurred',
      details: 'Extra details here'
    });
    render(<StatusMessages />);
    expect(screen.getByText('A Big Error Occurred')).toBeInTheDocument();
    expect(screen.getByText('Extra details here')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText(/dismiss message/i);
    expect(dismissButton).toBeInTheDocument();
    fireEvent.click(dismissButton);
    expect(clearStatusSpy).toHaveBeenCalledTimes(1);
  });

  it('renders success message and is dismissible', () => {
    useStatusStore.setState({ isLoading: false, type: 'success', message: 'Operation Successful!' });
    render(<StatusMessages />);
    expect(screen.getByText('Operation Successful!')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText(/dismiss message/i);
    expect(dismissButton).toBeInTheDocument();
    fireEvent.click(dismissButton);
    expect(clearStatusSpy).toHaveBeenCalledTimes(1);
  });

  it('renders info message and is dismissible', () => {
    useStatusStore.setState({ isLoading: false, type: 'info', message: 'Some informational update.' });
    render(<StatusMessages />);
    expect(screen.getByText('Some informational update.')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText(/dismiss message/i);
    expect(dismissButton).toBeInTheDocument();
    fireEvent.click(dismissButton);
    expect(clearStatusSpy).toHaveBeenCalledTimes(1);
  });

  it('renders warning message and is dismissible', () => {
    useStatusStore.setState({ isLoading: false, type: 'warning', message: 'This is a warning.' });
    render(<StatusMessages />);
    expect(screen.getByText('This is a warning.')).toBeInTheDocument();

    const dismissButton = screen.getByLabelText(/dismiss message/i);
    expect(dismissButton).toBeInTheDocument();
    fireEvent.click(dismissButton);
    expect(clearStatusSpy).toHaveBeenCalledTimes(1);
  });

  it('does not render if only isLoading is true but message is null and type is not loading', () => {
    useStatusStore.setState({ isLoading: true, message: null, type: 'info' });
    const { container } = render(<StatusMessages />);
    expect(container.firstChild).toBeNull();
  });

  it('does render if isLoading is true and message is present, even if type is not loading', () => {
    // This case tests if a non-loading type message might still be shown if isLoading is true.
    // The component logic: if (!message && isLoading && type !== 'loading') return null;
    // So, if message IS present, it should render.
    useStatusStore.setState({ isLoading: true, message: 'An info message during loading', type: 'info' });
    render(<StatusMessages />);
    expect(screen.getByText('An info message during loading')).toBeInTheDocument();
  });
});
