// vibe-player-v2-react/src/components/ToneDisplay.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ToneDisplay from './ToneDisplay';
import { useDtmfStore, DtmfState } from '../stores/dtmf.store'; // Import type

// Get initial state once to ensure we have the correct structure including actions
const initialDtmfStoreState = useDtmfStore.getState();

// Prepare a clean initial state for dtmf data properties only
const initialDtmfDataState: Pick<DtmfState, 'dtmf' | 'cpt' | 'status' | 'error'> = {
  dtmf: [],
  cpt: [],
  status: 'idle',
  error: null,
};


describe('ToneDisplay', () => {
  beforeEach(() => {
    // Reset only data-related parts of the store, keep actions intact
    useDtmfStore.setState(initialDtmfDataState, true);
  });

  it('renders "No tones detected yet." message by default', () => {
    render(<ToneDisplay />);
    expect(screen.getByText('Detected DTMF Tones:')).toBeInTheDocument();
    expect(screen.getByText('No tones detected yet.')).toBeInTheDocument();
  });

  it('displays DTMF tones when present in the store', () => {
    useDtmfStore.setState({ dtmf: ['1', '2', '3', 'A'] });
    render(<ToneDisplay />);
    const toneParagraph = screen.getByText((content, element) => {
        // Check if the element is a paragraph and if its text content matches the expected format
        return element?.tagName.toLowerCase() === 'p' && content.startsWith('1 2 3 A');
    });
    expect(toneParagraph).toBeInTheDocument();
    expect(screen.queryByText('No tones detected yet.')).toBeNull();
  });

  it('displays multiple DTMF tones separated by spaces', () => {
    const tones = ['#', '0', '*', '9'];
    useDtmfStore.setState({ dtmf: tones });
    render(<ToneDisplay />);
    const toneParagraph = screen.getByText(tones.join(' '));
    expect(toneParagraph).toBeInTheDocument();
    expect(toneParagraph.tagName.toLowerCase()).toBe('p');
    expect(toneParagraph).toHaveClass('font-mono'); // Check for styling
  });

  // The current ToneDisplay component does not explicitly show "Processing..." or error messages
  // It only displays detectedTones or "No tones detected yet."
  // If error/loading states were to be displayed within ToneDisplay itself, those tests would go here.
  // For now, these states are handled by the StatusMessages component.
  it('does not display CPT tones as it is not implemented in the component', () => {
    useDtmfStore.setState({ cpt: ['ring', 'busy'] }); // Set some CPT tones
    render(<ToneDisplay />);
    // Expect that CPT tones are not displayed, and it still shows default or DTMF tones.
    expect(screen.getByText('No tones detected yet.')).toBeInTheDocument();
    // Or, if DTMF tones were also set, it would show those instead.
  });

});
