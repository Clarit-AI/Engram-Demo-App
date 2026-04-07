import { useState } from 'react';
import { motion } from 'framer-motion';
import { StackLayers } from './StackLayers';

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

  const bgClass =
    isStateful || resendCount <= 1
      ? 'bg-bg-surface'
      : resendCount <= 3
        ? 'bg-waste-50'
        : resendCount <= 6
          ? 'bg-waste-100'
          : resendCount <= 9
            ? 'bg-waste-200'
            : 'bg-waste-300';

  const counterColor =
    resendCount <= 2
      ? 'text-text-muted'
      : resendCount <= 5
        ? 'text-waste-400'
        : resendCount <= 9
          ? 'text-waste-500 font-semibold'
          : 'text-waste-600 font-semibold';

  const heatIntensity =
    resendCount <= 1
      ? 'bg-waste-100'
      : resendCount <= 3
        ? 'bg-waste-200'
        : resendCount <= 6
          ? 'bg-waste-400'
          : 'bg-waste-600';

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
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="relative overflow-visible"
      onMouseEnter={() => ghostLayers > 0 && setRifled(true)}
      onMouseLeave={() => setRifled(false)}
    >
      {/* Ghost layers - rendered behind card, extend beyond boundaries */}
      <div className="absolute inset-0 pointer-events-none overflow-visible">
        <StackLayers count={ghostLayers} rifled={rifled} />
      </div>

      {/* Main card - rendered on top of ghost layers */}
      <div
        className={`relative z-10 rounded-xl border ${
          isNew
            ? 'border-l-clarit-500 border-l-[3px] border-border-default'
            : 'border-border-default'
        } ${bgClass} p-3 cursor-pointer transition-colors duration-300`}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
              {role}
            </span>
            {isNew && (
              <span className="text-[9px] font-bold text-clarit-600 bg-clarit-100 px-1.5 py-0.5 rounded">
                NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isStateful && resendCount > 1 && (
              <div className="w-[3px] h-5 rounded-full overflow-hidden bg-bg-secondary">
                <motion.div
                  className={`w-full rounded-full ${heatIntensity}`}
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
                className={`font-mono text-xs ${counterColor}`}
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
          <span className="text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded font-mono">
            {tokenCount} tok
          </span>
        </div>
      </div>
    </motion.div>
  );
}
