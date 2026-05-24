import { memo } from 'react';
import { motion } from 'framer-motion';
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
  const setInferenceMode = useArcStore((s) => s.setInferenceMode);
  const resetArc = useArcStore((s) => s.resetArc);
  const setPhase = useArcStore((s) => s.setPhase);
  const setAppMode = useArcStore((s) => s.setAppMode);
  const setTurn = useArcStore((s) => s.setTurn);
  const activeDemo = useArcStore((s) => s.activeDemo);

  const availabilityState = useArcStore((s) => s.availabilityState);
  const isStateful = inferenceMode === 'stateful';
  const isLive = availabilityState === 'open';
  const currentModel = appMode === 'chat' ? DEFAULT_LIVE_MODEL : (activeDemo?.model || DEFAULT_LIVE_MODEL);

  const handleReplay = () => {
    setAppMode('demo');
    resetArc();
    setPhase('intro');
  };

  const handleLiveChat = () => {
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

        {/* Left: Brand logos + inference mode toggle */}
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

          {/* Stateless / Stateful toggle */}
          <div
            className="flex items-center gap-0.5 rounded-3xl p-0.5"
            role="radiogroup"
            aria-label="Inference mode"
            style={{
              background: 'rgba(25,28,30,0.06)',
              border: '1px solid rgba(25,28,30,0.12)',
            }}
          >
            {(['stateless', 'stateful'] as const).map((mode) => {
              const active = inferenceMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setInferenceMode(mode)}
                  className="relative rounded-[20px] px-3.5 py-[7px] font-mono text-[8px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: active ? 'white' : '#8692A6', transition: 'color 0.2s ease' }}
                >
                  {active && (
                    <motion.span
                      layoutId="inference-toggle-pill"
                      className="absolute inset-0 rounded-[20px]"
                      style={{ background: '#00A1FF', boxShadow: '0 1px 4px rgba(0,161,255,0.25)' }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative">{mode}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: Powered by OVH (desktop only, absolute) */}
        {!mobile && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            <PoweredByOvh />
          </div>
        )}

        {/* Right: Optional env-gated controls + model chip + CTA group */}
        <div
          className={
            mobile
              ? 'no-scrollbar flex w-full max-w-full min-w-0 items-center gap-2 overflow-x-auto pb-1'
              : 'ml-auto flex min-w-0 items-center justify-end gap-2'
          }
        >
          {/* Recording export — only rendered when VITE_ENABLE_RECORDING_EXPORT=true */}
          {!mobile && <RecordingExportControl />}

          {/* Active model chip — desktop xl+ only */}
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

          {/* CTA group: gradient-bordered container */}
          <div
            className="flex items-center gap-2 rounded-3xl p-1"
            style={{
              background: 'linear-gradient(135deg, rgba(0,161,255,0.08), rgba(238,25,174,0.08))',
              border: '1.5px solid rgba(0,161,255,0.25)',
              boxShadow: '0 2px 10px rgba(0,161,255,0.12)',
            }}
          >
            <button
              type="button"
              onClick={handleReplay}
              className="min-h-9 rounded-full px-3.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-white transition-transform hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg, #00A1FF, #EE19AE)' }}
            >
              Replay Session
            </button>
            <button
              type="button"
              onClick={handleLiveChat}
              disabled={
                import.meta.env.VITE_DEV_BYPASS_AVAILABILITY !== 'true' &&
                availabilityState === 'offline'
              }
              className="flex min-h-9 items-center gap-1.5 rounded-full px-3.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-40"
              style={{
                background: appMode === 'chat' ? 'rgba(0,98,157,0.08)' : 'white',
                border: '1.5px solid rgba(0,161,255,0.3)',
                color: '#00629D',
              }}
            >
              {/* Availability indicator dot — visible when live, hidden when offline/invite-only */}
              {isLive && (
                <span
                  className="block shrink-0 rounded-full"
                  style={{
                    width: '5px',
                    height: '5px',
                    background: '#00c864',
                    boxShadow: '0 0 6px rgba(0,200,100,0.6)',
                  }}
                />
              )}
              Live Chat
            </button>
          </div>
        </div>

      </div>
    </header>
  );
});