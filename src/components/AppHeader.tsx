import { memo } from 'react';
import { useArcStore } from '../store/arcStore';
import { useChatStore } from '../store/chatStore';
import { BrandMark, PoweredByOvh } from './BrandMark';
import { RecordingExportControl } from './RecordingExportControl';
import { DEFAULT_LIVE_MODEL } from '../services/inferenceProvider';

function formatModelName(model: string): string {
  if (!model) return '';
  if (model.includes('nemotron')) {
    return 'Nemotron 3 Omni';
  }
  const parts = model.split('/');
  const name = parts[parts.length - 1];
  return name
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const AppHeader = memo(function AppHeader({ mobile = false }: { mobile?: boolean }) {
  const appMode = useArcStore((s) => s.appMode);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const resetArc = useArcStore((s) => s.resetArc);
  const setPhase = useArcStore((s) => s.setPhase);
  const setAppMode = useArcStore((s) => s.setAppMode);
  const setTurn = useArcStore((s) => s.setTurn);
  const activeDemo = useArcStore((s) => s.activeDemo);

  const availabilityState = useArcStore((s) => s.availabilityState);
  const isStateful = inferenceMode === 'stateful';
  const currentModel = appMode === 'chat' ? DEFAULT_LIVE_MODEL : (activeDemo?.model || DEFAULT_LIVE_MODEL);

  const availabilityLabel =
    availabilityState === 'open' ? 'Live' :
    availabilityState === 'code-required' ? 'Invite required' : 'Offline';
  const availabilityColor =
    availabilityState === 'open' ? 'rgba(0,200,100,0.12)' :
    availabilityState === 'code-required' ? 'rgba(255,180,0,0.12)' :
    'rgba(134,146,166,0.10)';
  const availabilityBorder =
    availabilityState === 'open' ? '1px solid rgba(0,200,100,0.28)' :
    availabilityState === 'code-required' ? '1px solid rgba(255,180,0,0.28)' :
    '1px solid rgba(134,146,166,0.18)';

  const handleReplay = () => {
    setAppMode('demo');
    resetArc();
    setPhase('intro');
  };

  const handleActuallyChat = () => {
    if (
      import.meta.env.VITE_DEV_BYPASS_AVAILABILITY !== 'true' &&
      availabilityState === 'offline'
    ) return;
    setAppMode('chat');
    // Align currentTurn with the actual live chat conversation length, so that we don't carry over the demo's turn count and render ghost artifacts.
    const liveMessages = useChatStore.getState().messages;
    const userTurnCount = liveMessages.filter((m) => m.role === 'user').length;
    setTurn(userTurnCount);
    setPhase(userTurnCount > 0 ? 'settled' : 'idle');
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
          {/* Availability badge from main */}
          <div
            className={[
              'hidden flex-col rounded-full px-3 py-1.5 font-mono uppercase sm:inline-flex',
              availabilityState === 'open' ? 'text-[#00c864]' : availabilityState === 'code-required' ? 'text-amber' : 'text-text-muted',
            ].join(' ')}
            style={{
              background: availabilityColor,
              border: availabilityBorder,
            }}
          >
            <span className="text-[6px] font-semibold tracking-[0.18em] opacity-60">
              Demo
            </span>
            <span className="text-[8px] font-semibold tracking-[0.16em]">
              {availabilityLabel}
            </span>
          </div>
          {/* Current view pill - our version */}
          <div
            className="hidden flex-col rounded-full px-3 py-1.5 font-mono uppercase sm:inline-flex"
            style={{
              background: isStateful ? 'rgba(0,125,108,0.08)' : 'rgba(25,28,30,0.06)',
              border: isStateful ? '1px solid rgba(0,125,108,0.22)' : '1px solid rgba(25,28,30,0.14)',
              color: isStateful ? '#005C4F' : '#111827',
            }}
          >
            <span className="text-[6px] font-bold tracking-[0.18em] opacity-80" style={{ color: isStateful ? '#007D6C' : '#4A5668' }}>
              Current view
            </span>
            <span className="text-[8px] font-bold tracking-[0.16em]">
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
            Replay session
          </button>
          <button
            type="button"
            onClick={handleActuallyChat}
            disabled={
              import.meta.env.VITE_DEV_BYPASS_AVAILABILITY !== 'true' &&
              availabilityState === 'offline'
            }
            className="min-h-9 rounded-full px-3.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] transition-colors disabled:opacity-40"
            style={{
              background: appMode === 'chat' ? 'rgba(0,98,157,0.08)' : 'var(--surface-container-high)',
              border: appMode === 'chat' ? '1px solid rgba(0,98,157,0.24)' : '1px solid rgba(25,28,30,0.16)',
              color: appMode === 'chat' ? '#004B78' : '#111827',
            }}
          >
            Actually chat
          </button>

          {!mobile && <RecordingExportControl />}
          {!mobile && (
            <div
              className="hidden min-h-9 items-center rounded-full px-3.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] xl:flex transition-colors"
              title={`Active model: ${currentModel}`}
              style={{
                background: 'rgba(25, 28, 30, 0.06)',
                border: '1px solid rgba(25, 28, 30, 0.14)',
                color: '#111827',
              }}
            >
              <span className="mr-1.5 font-sans lowercase font-semibold opacity-75" style={{ color: '#4A5668' }}>model</span>
              {formatModelName(currentModel)}
            </div>
          )}
        </div>
      </div>
    </header>
  );
});