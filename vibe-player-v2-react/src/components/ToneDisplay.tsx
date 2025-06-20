// vibe-player-v2-react/src/components/ToneDisplay.tsx
import { useDtmfStore } from '../stores/dtmf.store';

export default function ToneDisplay() {
  const { status, dtmf, cpt, error } = useDtmfStore(state => ({
    status: state.status,
    dtmf: state.dtmf,
    cpt: state.cpt,
    error: state.error,
  }));

  return (
    // The Svelte version had a card, App.tsx might provide it or we add it here if needed.
    // For now, just the content.
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Detected Tones</h3>

      <div>
        <h4 className="text-lg font-medium">DTMF (Dial Tones):</h4>
        {status === 'processing' && <p className="text-sm text-muted-foreground">Processing...</p>}
        {status === 'error' && error && <p className="text-sm text-red-500">Error: {error}</p>}
        {status !== 'processing' && status !== 'error' && dtmf.length > 0 && (
          <p data-testid="dtmf-display" className="font-mono text-lg p-2 bg-muted rounded">
            {dtmf.join(' ')}
          </p>
        )}
        {status !== 'processing' && status !== 'error' && dtmf.length === 0 && (
          <p className="text-sm text-muted-foreground">None detected.</p>
        )}
      </div>

      <div>
        <h4 className="text-lg font-medium">CPT (Call Progress Tones):</h4>
        {status === 'processing' && <p className="text-sm text-muted-foreground">Processing...</p>}
        {/* Error for CPT is typically part of the general DTMF store error */}
        {status !== 'processing' && status !== 'error' && cpt.length > 0 && (
          <p data-testid="cpt-display" className="font-mono text-lg p-2 bg-muted rounded">
            {cpt.join(' ')}
          </p>
        )}
        {status !== 'processing' && status !== 'error' && cpt.length === 0 && (
          <p className="text-sm text-muted-foreground">None detected.</p>
        )}
      </div>
    </div>
  );
}
