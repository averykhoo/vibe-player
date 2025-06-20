// vibe-player-v2-react/src/components/ToneDisplay.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import ToneDisplay from './ToneDisplay';
import { useDtmfStore, type DtmfState } from '../stores/dtmf.store'; // Import type

const initialDtmfState: DtmfState = useDtmfStore.getState(); // Get initial state structure

describe('ToneDisplay', () => {
  beforeEach(() => {
    // Reset store to a clean initial state before each test
    useDtmfStore.setState(initialDtmfState, true);
  });

  it('renders titles and "None detected" messages by default', () => {
    render(<ToneDisplay />);
    expect(screen.getByText('DTMF (Dial Tones):')).toBeInTheDocument();
    // Use queryAllByText to ensure we are selecting the correct "None detected" messages
    const noneMessages = screen.queryAllByText('None detected.');
    expect(noneMessages.length).toBe(2); // One for DTMF, one for CPT
    expect(screen.getByText('CPT (Call Progress Tones):')).toBeInTheDocument();
  });

  it('displays DTMF tones when present in store', () => {
    useDtmfStore.setState({ dtmf: ['1', '2', '3'], cpt: [], status: 'complete', error: null });
    render(<ToneDisplay />);
    expect(screen.getByTestId('dtmf-display')).toHaveTextContent('1 2 3');
  });

  it('displays CPT tones when present in store', () => {
    useDtmfStore.setState({ dtmf: [], cpt: ['ring', 'busy'], status: 'complete', error: null });
    render(<ToneDisplay />);
    expect(screen.getByTestId('cpt-display')).toHaveTextContent('ring busy');
  });

  it('shows processing message when status is processing', () => {
    useDtmfStore.setState({ status: 'processing', dtmf: [], cpt: [], error: null });
    render(<ToneDisplay />);
    // There will be two "Processing..." messages, one for DTMF and one for CPT
    const processingMessages = screen.getAllByText('Processing...');
    expect(processingMessages.length).toBeGreaterThanOrEqual(1); // At least one, likely 2
  });

  it('shows error message when status is error', () => {
    useDtmfStore.setState({ status: 'error', error: 'Test DTMF Error', dtmf: [], cpt: [] });
    render(<ToneDisplay />);
    expect(screen.getByText(/Error: Test DTMF Error/i)).toBeInTheDocument();
  });
});
