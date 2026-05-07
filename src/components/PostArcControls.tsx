import { memo, useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArcStore } from '../store/arcStore';
import { loadDemo, capDemoToTurns } from '../services/demoLibrary';

/**
 * PostArcControls — the floor of the dark pane after the reveal lands.
 *
 * Mounts after the stateless arc has completed and gives the viewer four levers:
 *   • Replay Demo            — resets currentTurn to 0, kicks the arc
 *                              orchestrator back to 'intro' so the
 *                              cinematic plays again.
 *   • Actually Chat          — flips appMode to 'chat'. Phase 8 wires
 *                              the live Vercel-AI-SDK call; until then
 *                              this is a stub that emits a console
 *                              breadcrumb so the affordance is testable.
 *   • Mode (Stateful ⇄       — toggles inferenceMode. Stateful keeps
 *      Stateless)              the compact packet on screen; Stateless
 *                              would re-stream the full payload on the
 *                              next turn (Phase 8 implementation).
 *   • Demo rotation          — dropdown of bundled demos; switching one
 *                              loads the new fixture and restarts the
 *                              arc from turn 0.
 *
 * Visual register: glass-chip row anchored bottom-center of the dark
 * pane, above the TimelineStrip. Pure DESIGN.md vocabulary — no borders,
 * `full` rounding on pill buttons, ambient-shadow on the row, signature
 * gradient on the primary CTA, secondary-container teal on the active
 * stateful state (DESIGN.md "data success" semantic).
 */
export const PostArcControls = memo(function PostArcControls() {
  const phase = useArcStore((s) => s.phase);
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const setInferenceMode = useArcStore((s) => s.setInferenceMode);
  const catalog = useArcStore((s) => s.catalog);
  const activeDemoKey = useArcStore((s) => s.activeDemoKey);
  const turnsCap = useArcStore((s) => s.turnsCap);
  const setActiveDemo = useArcStore((s) => s.setActiveDemo);
  const resetArc = useArcStore((s) => s.resetArc);
  const setPhase = useArcStore((s) => s.setPhase);
  const setAppMode = useArcStore((s) => s.setAppMode);

  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Click-outside to dismiss the demo dropdown
  useEffect(() => {
    if (!demoMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDemoMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [demoMenuOpen]);

  const showControls = phase === 'peaking' || phase === 'post-arc';
  if (!showControls) return null;

  const handleReplay = () => {
    resetArc();
    // resetArc preserves the active demo and bumps phase to 'intro' if
    // a demo is loaded — the orchestrator effect in ReReadStage takes
    // it from there.
    setPhase('intro');
  };

  const handleActuallyChat = () => {
    setAppMode('chat');
    // Phase 8 wiring pending — for now we just flip mode and log so the
    // affordance is testable end-to-end without the live backend.
    console.info('[PostArcControls] actually-chat: live backend not wired yet (Phase 8)');
  };

  const handleSelectDemo = async (key: string) => {
    if (key === activeDemoKey) {
      setDemoMenuOpen(false);
      return;
    }
    setLoadingKey(key);
    const demo = await loadDemo(key);
    setLoadingKey(null);
    setDemoMenuOpen(false);
    if (!demo) return;
    const capped = capDemoToTurns(demo.messages, turnsCap);
    setActiveDemo(key, {
      ...demo,
      messages: capped,
      turnCount: capped.filter((m) => m.role === 'user').length,
    });
    // setActiveDemo resets currentTurn to 0 and phase to 'intro' — the
    // orchestrator picks up from there.
  };

  const isStateful = inferenceMode === 'stateful';
  const activeDemo = catalog.find((d) => d.key === activeDemoKey);

  return (
    <AnimatePresence>
      <motion.div
        key="post-arc-controls"
        className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 26, mass: 0.9, delay: 0.15 }}
      >
        <div
          className="glass-chip-dark rounded-full px-2 py-2 flex items-center gap-1.5 ambient-shadow-dark"
          style={{ minWidth: 'max-content' }}
        >
          {/* Replay — primary CTA, signature gradient */}
          <button
            type="button"
            onClick={handleReplay}
            className="sig-gradient rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-semibold transition-transform hover:scale-[1.03] active:scale-[0.98]"
            style={{ color: '#fff' }}
            aria-label="Replay the demo arc from turn 1"
          >
            ⟲ Replay Demo
          </button>

          {/* Actually Chat — secondary CTA */}
          <button
            type="button"
            onClick={handleActuallyChat}
            className="rounded-full px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors"
            style={{
              background: 'rgba(190,199,212,0.06)',
              color: 'var(--on-surface-dark)',
              border: '1px solid rgba(190,199,212,0.14)',
            }}
            aria-label="Switch to live chat mode"
          >
            → Actually Chat
          </button>

          {/* Mode toggle pill — stateless ⇄ stateful */}
          <div
            className="flex items-center rounded-full p-0.5 ml-1"
            role="radiogroup"
            aria-label="Inference mode"
            style={{ background: 'rgba(10,17,25,0.55)' }}
          >
            <button
              type="button"
              role="radio"
              aria-checked={!isStateful}
              onClick={() => setInferenceMode('stateless')}
              className="relative rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] font-semibold transition-colors"
              style={{
                color: !isStateful ? 'var(--on-surface-dark)' : 'var(--on-surface-dark-muted)',
              }}
            >
              {!isStateful && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'rgba(0,163,255,0.18)', border: '1px solid rgba(0,163,255,0.32)' }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                />
              )}
              <span className="relative">Stateless</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={isStateful}
              onClick={() => setInferenceMode('stateful')}
              className="relative rounded-full px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] font-semibold transition-colors"
              style={{
                color: isStateful ? 'var(--secondary-container)' : 'var(--on-surface-dark-muted)',
              }}
            >
              {isStateful && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'rgba(104,250,221,0.14)',
                    border: '1px solid rgba(104,250,221,0.32)',
                  }}
                  transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                />
              )}
              <span className="relative">Stateful</span>
            </button>
          </div>

          {/* Demo rotation dropdown */}
          <div className="relative ml-1" ref={menuRef}>
            <button
              type="button"
              onClick={() => setDemoMenuOpen((v) => !v)}
              className="rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] font-semibold transition-colors flex items-center gap-1.5"
              style={{
                background: 'rgba(190,199,212,0.06)',
                color: 'var(--on-surface-dark)',
                border: '1px solid rgba(190,199,212,0.14)',
                maxWidth: '200px',
              }}
              aria-haspopup="listbox"
              aria-expanded={demoMenuOpen}
            >
              <span
                className="truncate"
                title={activeDemo?.title ?? activeDemoKey}
              >
                {activeDemo?.title ?? activeDemoKey}
              </span>
              <span
                className="text-[8px] opacity-60"
                style={{ transform: demoMenuOpen ? 'rotate(180deg)' : 'none' }}
              >
                ▾
              </span>
            </button>

            <AnimatePresence>
              {demoMenuOpen && (
                <motion.ul
                  role="listbox"
                  className="absolute bottom-full mb-2 right-0 min-w-[240px] rounded-2xl py-2 ambient-shadow-dark"
                  style={{
                    background: 'var(--surface-container-high-dark)',
                    border: '1px solid rgba(190,199,212,0.10)',
                  }}
                  initial={{ y: 8, opacity: 0, scale: 0.96 }}
                  animate={{ y: 0, opacity: 1, scale: 1 }}
                  exit={{ y: 8, opacity: 0, scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                >
                  {catalog.map((d) => {
                    const active = d.key === activeDemoKey;
                    const loading = loadingKey === d.key;
                    return (
                      <li key={d.key} role="option" aria-selected={active}>
                        <button
                          type="button"
                          onClick={() => handleSelectDemo(d.key)}
                          disabled={loading}
                          className="w-full text-left px-4 py-2 flex items-center justify-between gap-3 transition-colors hover:bg-white/[0.04] disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <div
                              className="font-mono text-[11px] truncate"
                              style={{
                                color: active
                                  ? 'var(--primary-container)'
                                  : 'var(--on-surface-dark)',
                              }}
                              title={d.title}
                            >
                              {d.title}
                            </div>
                            <div
                              className="font-mono text-[9px] uppercase tracking-[0.16em] mt-0.5"
                              style={{ color: 'var(--on-surface-dark-faint)' }}
                            >
                              {d.turnCount} turns · {d.model.split('/').pop()}
                            </div>
                          </div>
                          {active && (
                            <span
                              className="text-[10px]"
                              style={{ color: 'var(--primary-container)' }}
                              aria-hidden
                            >
                              ●
                            </span>
                          )}
                          {loading && (
                            <span
                              className="text-[9px] font-mono uppercase tracking-[0.18em]"
                              style={{ color: 'var(--on-surface-dark-muted)' }}
                            >
                              …
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
