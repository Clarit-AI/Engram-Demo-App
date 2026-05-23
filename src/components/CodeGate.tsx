import { memo, useState } from 'react';

export interface CodeGateProps {
  onSuccess?: () => void;
}

export const CodeGate = memo(function CodeGate({ onSuccess }: CodeGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json() as { error?: string; ok?: boolean };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Invalid code.');
      } else {
        setCode('');
        setSuccess(true);
        onSuccess?.();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-black/20 bg-surface-container-lowest p-6 shadow-2xl">
        <div className="mb-1 text-center font-mono text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
          Partner Demo Access
        </div>
        <h2 className="mb-4 text-center font-sans text-xl font-bold text-on-surface">
          Enter invite code
        </h2>
        <p className="mb-6 text-center font-sans text-sm text-text-muted">
          This live window is reserved for invite holders. Enter your code to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="code-gate-input" className="sr-only">
            Invite code
          </label>
          <input
            id="code-gate-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="INVITE-CODE"
            className="w-full rounded-lg border border-black/20 bg-surface-container-high px-4 py-3 font-mono text-sm uppercase tracking-wider placeholder:text-text-disabled focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoComplete="off"
            spellCheck={false}
          />
          {error && (
            <p className="text-center font-sans text-xs text-error">{error}</p>
          )}
          {success && (
            <p className="text-center font-sans text-xs text-[#00c864]">Code accepted. Unlocking…</p>
          )}
          <button
            type="submit"
            disabled={loading || !code.trim() || success}
            className="sig-gradient w-full rounded-full py-3 font-mono text-xs font-semibold uppercase tracking-[0.16em] text-white transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? 'Validating…' : 'Unlock live demo'}
          </button>
        </form>
        <p className="mt-4 text-center font-sans text-xs text-text-disabled">
          Don&apos;t have a code? Watch a recorded session instead.
        </p>
      </div>
    </div>
  );
});