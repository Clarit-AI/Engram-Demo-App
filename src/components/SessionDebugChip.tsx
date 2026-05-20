import { useSessionStore } from '../store/sessionStore';

function shouldShowSessionDebug(): boolean {
  if (import.meta.env.VITE_SESSION_DEBUG === 'true') return true;
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export function SessionDebugChip() {
  const status = useSessionStore((s) => s.status);
  const session = useSessionStore((s) => s.session);
  const rateLimit = useSessionStore((s) => s.rateLimit);
  const errorMessage = useSessionStore((s) => s.errorMessage);

  if (!shouldShowSessionDebug()) return null;

  const label = session
    ? `${session.idPreview} · ${rateLimit?.requestsThisMinute ?? session.requestsThisMinute}/${rateLimit?.maxRequestsPerMinute ?? '-'} req · ${rateLimit?.globalInFlight ?? session.inFlight} live`
    : status === 'error'
      ? 'session error'
      : 'session pending';

  return (
    <div
      className="hidden min-h-9 items-center rounded-full px-3 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-text-muted xl:flex"
      title={errorMessage || 'Local session and rate-limit debug readout'}
      style={{
        background: status === 'error' ? 'rgba(220,38,38,0.10)' : 'rgba(25,28,30,0.06)',
        border: status === 'error' ? '1px solid rgba(220,38,38,0.22)' : '1px solid rgba(25,28,30,0.10)',
      }}
    >
      {label}
    </div>
  );
}
