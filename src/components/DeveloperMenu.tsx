import { memo, useState } from 'react';
import { useArcStore } from '../store/arcStore';
import { useSessionStore } from '../store/sessionStore';

export const DeveloperMenu = memo(function DeveloperMenu() {
  const [expanded, setExpanded] = useState(false);
  const availabilityState = useArcStore((s) => s.availabilityState);
  const setAvailabilityState = useArcStore((s) => s.setAvailabilityState);
  const debugHoldStateless = useArcStore((s) => s.debugHoldStateless);
  const setDebugHoldStateless = useArcStore((s) => s.setDebugHoldStateless);
  const phase = useArcStore((s) => s.phase);
  const setPhase = useArcStore((s) => s.setPhase);
  const canReveal = phase === 'peaking';

  const sessionStatus = useSessionStore((s) => s.status);
  const session = useSessionStore((s) => s.session);
  const rateLimit = useSessionStore((s) => s.rateLimit);
  const errorMessage = useSessionStore((s) => s.errorMessage);

  const sessionLabel = session
    ? `${session.idPreview} · ${rateLimit?.requestsThisMinute ?? session.requestsThisMinute}/${rateLimit?.maxRequestsPerMinute ?? '-'} req · ${rateLimit?.globalInFlight ?? session.inFlight} live · q:${rateLimit?.queueDepth ?? 0}`
    : sessionStatus === 'error'
      ? 'session error'
      : 'session pending';

  const visible = import.meta.env.VITE_SESSION_DEBUG === 'true';
  if (!visible) return null;

  const availOptions: Array<'offline' | 'code-required' | 'open'> = [
    'offline',
    'code-required',
    'open',
  ];

  const availLabel: Record<string, string> = {
    offline: 'Offline',
    'code-required': 'Invite Required',
    open: 'Live',
  };

  return (
    <div className="fixed right-0 inset-y-0 z-50 flex items-center">
      {/* Expanded panel */}
      {expanded && (
        <div
          className="flex flex-col gap-4 rounded-l-xl border border-black/10 p-4 shadow-xl"
          style={{
            background: 'var(--surface-container-high, #f5f5f5)',
            width: '240px',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
              Developer Options
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="text-[10px] text-text-muted hover:text-text-primary"
            >
              ✕
            </button>
          </div>

          {/* Session Debug Info */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide">Session Debug</span>
            <div
              className="min-h-9 flex items-center rounded-full px-3 font-mono text-[8px] font-semibold uppercase tracking-[0.12em]"
              style={{
                background: sessionStatus === 'error' ? 'rgba(220,38,38,0.10)' : 'rgba(25,28,30,0.06)',
                border: sessionStatus === 'error' ? '1px solid rgba(220,38,38,0.22)' : '1px solid rgba(25,28,30,0.10)',
                color: sessionStatus === 'error' ? '#dc2626' : '#111827',
              }}
              title={errorMessage || 'Local session and rate-limit debug readout'}
            >
              {sessionLabel}
            </div>
          </div>

          {/* Availability Status */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide">Availability Status</span>
            <span className="text-[9px] leading-relaxed text-[#111827]">
              Controls whether the "Actually chat" button is active. Live = system is running. Invite Required = system needs an access code. Offline = system is down.
            </span>
            <div className="flex gap-1 mt-1">
              {availOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setAvailabilityState(opt)}
                  className="flex-1 rounded-full py-1.5 px-2 text-[8px] font-bold uppercase tracking-wide transition-colors"
                  style={{
                    background:
                      availabilityState === opt
                        ? opt === 'open'
                          ? 'rgba(0,200,100,0.15)'
                          : opt === 'code-required'
                            ? 'rgba(255,180,0,0.15)'
                            : 'rgba(134,146,166,0.15)'
                        : 'transparent',
                    border:
                      availabilityState === opt
                        ? opt === 'open'
                          ? '1px solid rgba(0,200,100,0.4)'
                          : opt === 'code-required'
                            ? '1px solid rgba(255,180,0,0.4)'
                            : '1px solid rgba(134,146,166,0.3)'
                        : '1px solid rgba(25,28,30,0.1)',
                    color:
                      availabilityState === opt
                        ? opt === 'open'
                          ? '#00c864'
                          : opt === 'code-required'
                            ? '#b45309'
                            : '#111827'
                        : '#111827',
                  }}
                >
                  {availLabel[opt]}
                </button>
              ))}
            </div>
          </div>

          {/* Hold Reveal */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide">Hold Reveal</span>
            <span className="text-[9px] leading-relaxed text-[#111827]">
              When ON: stops the automatic reveal from firing after the final demo turn. When OFF: reveal fires automatically once all turns are done. Useful for testing the reveal animation.
            </span>
            <button
              onClick={() => setDebugHoldStateless(!debugHoldStateless)}
              className="mt-1 rounded-full py-1.5 px-3 text-[9px] font-bold uppercase tracking-wide transition-colors"
              style={{
                background: debugHoldStateless ? 'rgba(0,98,157,0.1)' : 'transparent',
                border: debugHoldStateless
                  ? '1px solid rgba(0,98,157,0.3)'
                  : '1px solid rgba(25,28,30,0.1)',
                color: debugHoldStateless ? '#004B78' : '#111827',
              }}
            >
              {debugHoldStateless ? 'ON — reveal paused' : 'OFF — reveal will fire'}
            </button>
          </div>

          {/* Trigger Reveal */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wide">Trigger Reveal</span>
            <span className="text-[9px] leading-relaxed text-[#111827]">
              Manually fires the stateful reveal animation at any time. Only active once the demo has reached the &quot;peaking&quot; phase — after all turns complete.
            </span>
            <button
              disabled={!canReveal}
              onClick={() => {
                setDebugHoldStateless(false);
                setPhase('revealing');
              }}
              className="mt-1 rounded-full py-1.5 px-3 text-[9px] font-bold uppercase tracking-wide transition-colors disabled:opacity-30"
              style={{
                background: canReveal ? 'rgba(0,92,79,0.1)' : 'transparent',
                border: canReveal ? '1px solid rgba(0,92,79,0.3)' : '1px solid rgba(25,28,30,0.1)',
                color: canReveal ? '#005C4F' : '#111827',
              }}
            >
              {canReveal ? 'Trigger Reveal Now' : 'Unavailable (not in peaking phase)'}
            </button>
          </div>
        </div>
      )}

      {/* Collapsed toggle tab */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex h-10 w-6 items-center justify-center rounded-l-full shadow-md"
          style={{
            background: 'var(--surface-container-high, #e5e5e5)',
            border: '1px solid rgba(25,28,30,0.1)',
            borderRight: 'none',
          }}
          title="Developer Menu"
        >
          <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
            Dev
          </span>
        </button>
      )}
    </div>
  );
});