import { useState } from 'react';
import { motion } from 'framer-motion';
import { StackLayers } from './StackLayers';
import { heatTint, roleStripe } from '../lib/colors';
import { cascade } from '../lib/springs';

interface MessageCardProps {
  role: string;
  content: string;
  tokenCount: number;
  resendCount: number;
  isNew: boolean;
  isStateful: boolean;
}

export function MessageCard({ role, content, tokenCount, resendCount, isNew, isStateful }: MessageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [rifled, setRifled] = useState(false);
  const ghostLayers = isStateful ? 0 : Math.min(Math.max(resendCount - 1, 0), 6);

  const tint = heatTint(isStateful ? 1 : resendCount);
  const stripe = roleStripe(role === 'user' ? 'user' : 'assistant');

  const stackedPadding = ghostLayers * 3;
  const stackedMargin = ghostLayers * 2;
  const rifledPadding = ghostLayers * 8;
  const rifledMargin = ghostLayers * 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: 1,
        y: 0,
        paddingBottom: rifled ? rifledPadding : stackedPadding,
        marginLeft: rifled ? rifledMargin : stackedMargin,
      }}
      exit={{ opacity: 0, y: -10 }}
      transition={cascade}
      className="relative overflow-visible"
      onMouseEnter={() => ghostLayers > 0 && setRifled(true)}
      onMouseLeave={() => setRifled(false)}
    >
      {/* Ghost layers */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        <StackLayers count={ghostLayers} rifled={rifled} resendCount={resendCount} />
      </div>

      {/* Main card */}
      <motion.div
        className="relative z-10 rounded-xl border p-3 cursor-pointer"
        style={{
          background: `linear-gradient(180deg, ${tint.bgFrom}, ${tint.bgTo})`,
          borderColor: tint.border,
          borderLeft: `3px solid ${stripe}`,
          boxShadow: resendCount > 2
            ? `0 6px 18px -10px ${tint.shadow}`
            : 'none',
        }}
        animate={{
          filter: rifled ? 'brightness(1.03) saturate(1.05)' : 'brightness(1) saturate(1)',
        }}
        transition={{ duration: 0.2 }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.12em] font-mono"
              style={{ color: tint.accent }}
            >
              {role}
            </span>
            {isNew && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--clarit-700)',
                  background: 'var(--clarit-100)',
                }}
              >
                NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isStateful && resendCount > 1 && (
              <div className="w-[3px] h-5 rounded-full overflow-hidden bg-white/50">
                <motion.div
                  className="w-full rounded-full"
                  style={{ background: tint.accent }}
                  initial={{ height: '20%' }}
                  animate={{ height: `${Math.min(resendCount * 10, 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
            {!isStateful && (
              <motion.span
                key={resendCount}
                initial={{ y: -8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="font-mono text-[11px] font-semibold tabular-nums"
                style={{ color: tint.accent }}
              >
                ×{resendCount}
              </motion.span>
            )}
          </div>
        </div>

        {/* Content */}
        <p className={`text-sm text-text-primary leading-relaxed ${!expanded ? 'line-clamp-3' : ''}`}>
          {content}
        </p>

        {/* Token count */}
        <div className="mt-2">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums"
            style={{
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.55)',
            }}
          >
            {tokenCount} tok
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
