import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useReducedMotion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { MessageStacks } from './MessageStacks';
import type { MessageStack } from './MessageStacks';
import { instrument } from '../lib/springs';

export function PayloadInspector() {
  const mode = useDemoStore((s) => s.mode);
  const turnPayloads = useDemoStore((s) => s.turnPayloads);
  const currentTurn = useDemoStore((s) => s.currentTurn);
  const currentPayloadTokens = useDemoStore((s) => s.currentPayloadTokens);
  const currentNewTokens = useDemoStore((s) => s.currentNewTokens);

  const currentPayload = turnPayloads[turnPayloads.length - 1];
  const payloadMessages = currentPayload?.request.body.messages || [];

  const stacks: MessageStack[] = payloadMessages
    .filter((msg) => msg.role !== 'system')
    .map((msg, idx) => {
      const cardCount = currentTurn - idx;
      return {
        id: `stack-${idx}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        tokens: Math.ceil(msg.content.length / 4),
        turnNumber: idx + 1,
        cardCount,
      };
    });

  const redundantTokens = currentPayloadTokens - currentNewTokens;
  const barTotal = Math.max(currentPayloadTokens, 1);
  const redundancyRatio = barTotal > 0 ? redundantTokens / barTotal : 0;

  // Parallax tilt — only kicks in at turn >= 2 so the empty state doesn't move.
  const reduced = useReducedMotion();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rawRX = useMotionValue(0);
  const rawRY = useMotionValue(0);
  const rotateX = useSpring(rawRX, { stiffness: 160, damping: 22 });
  const rotateY = useSpring(rawRY, { stiffness: 160, damping: 22 });
  const tiltActive = !reduced && currentTurn >= 2;

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltActive || !panelRef.current) return;
    const r = panelRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const nx = (e.clientX - cx) / (r.width / 2);
    const ny = (e.clientY - cy) / (r.height / 2);
    rawRY.set(nx * 2.5);   // max 2.5° — very subtle
    rawRX.set(-ny * 1.8);
  };

  const onMouseLeave = () => {
    rawRX.set(0);
    rawRY.set(0);
  };

  // Weight-reactive shadow — pile "presses down" as redundancy grows.
  // Base ambient + burn tint once redundancy passes 40%.
  const baseShadow = `0 ${Math.round(20 + redundancyRatio * 60)}px ${Math.round(
    40 + redundancyRatio * 80,
  )}px -20px rgba(11,18,32, ${(0.08 + redundancyRatio * 0.18).toFixed(3)})`;
  const burnGlow =
    redundancyRatio > 0.4
      ? `, inset 0 -40px 80px -40px rgba(232,148,96, ${(
          (redundancyRatio - 0.4) * 0.22
        ).toFixed(3)})`
      : '';
  const combinedShadow = `${baseShadow}${burnGlow}`;

  return (
    <div
      ref={panelRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative flex flex-col h-full"
      style={{ perspective: 1800 }}
    >
      <motion.div
        className="flex flex-col h-full"
        style={{
          rotateX: tiltActive ? rotateX : 0,
          rotateY: tiltActive ? rotateY : 0,
          transformStyle: 'preserve-3d',
          boxShadow: combinedShadow,
          background: 'var(--bg-primary)',
          borderRadius: '0',
        }}
        transition={{ duration: 0 }}
      >
        {/* Panel Header */}
        <div
          className="flex-none px-4 pt-3 pb-2 border-b"
          style={{ borderColor: 'var(--border-default)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display text-[13px] font-bold text-text-primary tracking-tight">
              Payload Inspector
            </h2>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.14em] font-mono px-2 py-0.5 rounded-full"
                style={
                  mode === 'stateful'
                    ? {
                        background: 'var(--clarit-100)',
                        color: 'var(--clarit-700)',
                        border: '1px solid var(--clarit-200)',
                      }
                    : {
                        background: 'var(--burn-100)',
                        color: 'var(--burn-700)',
                        border: '1px solid var(--burn-200)',
                      }
                }
              >
                {mode}
              </span>
              {currentTurn > 0 && (
                <span className="text-[11px] text-text-muted font-mono tabular-nums tracking-wider">
                  Turn <span className="text-text-primary font-semibold">{currentTurn}</span>
                </span>
              )}
            </div>
          </div>

          {/* Payload size bar */}
          {currentTurn > 0 && (
            <div className="space-y-1">
              <div
                className="flex h-2 rounded-full overflow-hidden relative"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(redundantTokens / barTotal) * 100}%` }}
                  transition={instrument}
                  style={{
                    background:
                      'linear-gradient(90deg, var(--burn-300), var(--burn-500))',
                  }}
                />
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(currentNewTokens / barTotal) * 100}%` }}
                  transition={instrument}
                  style={{
                    background:
                      'linear-gradient(90deg, var(--clarit-400), var(--clarit-600))',
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-text-muted font-mono tabular-nums tracking-wider">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: 'var(--burn-500)' }}
                  />
                  redundant
                </span>
                <span>
                  {currentPayloadTokens.toLocaleString()} tok
                </span>
                <span className="flex items-center gap-1">
                  new
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: 'var(--clarit-500)' }}
                  />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* MessageStacks Animation */}
        <div className="flex-1 overflow-hidden" style={{ transform: 'translateZ(0)' }}>
          {currentTurn === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-text-muted">
              Send a message to see the payload
            </div>
          ) : (
            <MessageStacks stacks={stacks} />
          )}
        </div>

        {/* Footer */}
        <div
          className="flex-none px-4 py-2 border-t text-[11px] text-text-muted font-mono tracking-wide"
          style={{ borderColor: 'var(--border-default)' }}
        >
          {mode === 'stateful'
            ? 'Only new message + context_id sent. Server maintains state.'
            : 'Full conversation context resent every turn.'}
        </div>
      </motion.div>
    </div>
  );
}
