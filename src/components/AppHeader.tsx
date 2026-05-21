import { memo } from 'react';
import { useArcStore } from '../store/arcStore';
import { BrandMark, PoweredByOvh } from './BrandMark';
import { SessionDebugChip } from './SessionDebugChip';
import { RecordingExportControl } from './RecordingExportControl';

/** Show debug controls when VITE_SESSION_DEBUG=true, or when running locally in dev mode. */
function shouldShowDebugControls(): boolean {
  if (import.meta.env.VITE_SESSION_DEBUG === 'true') return true;
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export const AppHeader = memo(function AppHeader({ mobile = false }: { mobile?: boolean }) {
  const appMode = useArcStore((s) => s.appMode);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const resetArc = useArcStore((s) => s.resetArc);
  const setPhase = useArcStore((s) => s.setPhase);
  const setAppMode = useArcStore((s) => s.setAppMode);
  const setTurn = useArcStore((s) => s.setTurn);
  const phase = useArcStore((s) => s.phase);
  const debugHoldStateless = useArcStore((s) => s.debugHoldStateless);
  const setDebugHoldStateless = useArcStore((s) => s.setDebugHoldStateless);

  const isStateful = inferenceMode === 'stateful';
  const canReveal = phase === 'peaking';

  const handleReplay = () => {
    setAppMode('demo');
    resetArc();
    setPhase('intro');
  };

  const handleActuallyChat = () => {
    setAppMode('chat');
    // Reset the demo's turn counter so the left pane doesn't inherit stale
    // demo bundle cards and render ghost artifacts before any messages are sent.
    setTurn(0);
  };

  return (
    <header
      className={
        mobile
          ? 'relative z-40 flex-none overflow-hidden border-b border-black/10 bg-surface-container-lowest px-3 py-2'
          : 'relative z-40 flex-none border-b border-black/10 bg-surface-container-lowest px-5 py-3'
      }
    >
      <div className={mobile ? 'flex min-w-0 max-w-full flex-col gap-2 overflow-hidden' : 'relative flex items-center justify-between gap-5'}>
        <div className={mobile ? 'flex w-full min-w-0 items-center gap-3' : 'flex min-w-0 items-center gap-3'}>
          <BrandMark
            brand="clarit"
            tone="primary"
            className={mobile ? 'h-[22px] w-[46px]' : 'h-[28px] w-[60px]'}
          />
          <div className="h-7 w-px bg-black/10" />
          <BrandMark
            brand="engram"
            tone="primary"
            className={mobile ? 'h-[22px] w-[92px]' : 'h-[28px] w-[120px]'}
          />
          {mobile && (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="font-mono text-[7px] uppercase tracking-[0.14em] text-text-muted">
                By
              </span>
              <BrandMark brand="ovh" tone="primary" className="h-[10px] w-[62px]" />
            </div>
          )}
          <div
            className={[
              'hidden flex-col rounded-full px-3 py-1.5 font-mono uppercase sm:inline-flex',
              isStateful ? 'text-secondary' : 'text-text-muted',
            ].join(' ')}
            style={{
              background: isStateful ? 'rgba(104,250,221,0.12)' : 'rgba(134,146,166,0.10)',
              border: isStateful ? '1px solid rgba(104,250,221,0.28)' : '1px solid rgba(134,146,166,0.18)',
            }}
          >
            <span className="text-[6px] font-semibold tracking-[0.18em] opacity-60">
              Current view
            </span>
            <span className="text-[8px] font-semibold tracking-[0.16em]">
              {isStateful ? 'With Engram' : 'Without Engram'}
            </span>
          </div>
        </div>

        {!mobile && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <PoweredByOvh />
          </div>
        )}

        <div
          className={
            mobile
              ? 'no-scrollbar flex w-full max-w-full min-w-0 items-center gap-2 overflow-x-auto pb-1'
              : 'ml-auto flex min-w-0 items-center justify-end gap-2'
          }
        >
          <button
            type="button"
            onClick={handleReplay}
            className="sig-gradient min-h-9 rounded-full px-3.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Replay simulation
          </button>
          <button
            type="button"
            onClick={handleActuallyChat}
            className="min-h-9 rounded-full px-3.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] transition-colors"
            style={{
              background: appMode === 'chat' ? 'rgba(0,163,255,0.12)' : 'var(--surface-container)',
              border: appMode === 'chat' ? '1px solid rgba(0,163,255,0.26)' : '1px solid rgba(25,28,30,0.10)',
              color: appMode === 'chat' ? 'var(--primary)' : 'var(--text-secondary)',
            }}
          >
            Actually chat
          </button>

          {shouldShowDebugControls() && !mobile && (
            <div className="flex min-h-9 items-center gap-1 rounded-full bg-surface-container px-1.5">
              <button
                type="button"
                title={debugHoldStateless ? 'Hold is ON — reveal will not auto-trigger after the last turn' : 'Hold is OFF — reveal will auto-trigger after the last turn'}
                onClick={() => setDebugHoldStateless(!debugHoldStateless)}
                className="rounded-full px-2.5 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.14em]"
                style={{
                  background: debugHoldStateless ? 'rgba(0,163,255,0.12)' : 'transparent',
                  color: debugHoldStateless ? 'var(--primary)' : 'var(--text-muted)',
                }}
              >
                Hold
              </button>
              <button
                type="button"
                disabled={!canReveal}
                title={canReveal ? 'Trigger the stateful reveal now' : 'Reveal activates only after the last demo turn completes (phase: peaking)'}
                onClick={() => {
                  setDebugHoldStateless(false);
                  setPhase('revealing');
                }}
                className="rounded-full px-2.5 py-1.5 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: 'var(--secondary)' }}
              >
                Reveal
              </button>
            </div>
          )}
          {!mobile && <RecordingExportControl />}
          {!mobile && <SessionDebugChip />}
        </div>
      </div>
    </header>
  );
});
