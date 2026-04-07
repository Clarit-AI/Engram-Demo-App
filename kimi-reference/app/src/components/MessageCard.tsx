/**
 * MessageCard.tsx
 * 
 * Displays a chat message with visual representation of payload redundancy.
 * Shows ghost layers behind the card to indicate how many times this message
 * has been re-sent in the conversation payload (stateless AI pattern).
 * 
 * Features:
 * - Ghost layer stack visualization
 * - Hover "riffle" effect to reveal stack depth
 * - Role indicator (user/assistant)
 * - Token count display
 * - Redundancy count badge
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { StackLayers } from './StackLayers';
import { User, Bot, Layers } from 'lucide-react';

export interface MessageCardProps {
  /** Message content preview */
  content: string;
  /** Message role */
  role: 'user' | 'assistant';
  /** Number of times this message has been re-sent (determines stack depth) */
  resendCount: number;
  /** Token count for this message */
  tokenCount: number;
  /** Optional timestamp */
  timestamp?: string;
  /** Whether this is in stateful mode (no ghost layers) */
  isStateful?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export function MessageCard({
  content,
  role,
  resendCount,
  tokenCount,
  timestamp,
  isStateful = false,
  onClick,
  className = '',
}: MessageCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  // In stateful mode, there's no redundancy
  const effectiveResendCount = isStateful ? 0 : resendCount;
  const hasStack = effectiveResendCount > 0;

  // Truncate content for preview
  const previewText = content.length > 80 
    ? content.slice(0, 80) + '...' 
    : content;

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 
        Ghost layers container
        - Uses overflow-visible to allow layers to extend beyond card bounds
        - Padding bottom creates space for the stack to fan out on hover
      */}
      <div 
        className={`
          relative
          ${hasStack ? 'pb-8' : ''}
        `}
        style={{ overflow: 'visible' }}
      >
        {/* Ghost layers - rendered behind main card */}
        {!isStateful && (
          <StackLayers 
            layerCount={effectiveResendCount} 
            isHovered={isHovered}
            maxVisibleLayers={8}
          />
        )}

        {/* Main card */}
        <motion.div
          className={`
            relative z-10 cursor-pointer
            rounded-lg border bg-white p-3 shadow-sm
            transition-shadow duration-200
            ${hasStack ? 'border-waste-300' : 'border-gray-200'}
            ${isHovered ? 'shadow-md' : ''}
          `}
          onClick={onClick}
          whileTap={{ scale: 0.995 }}
        >
          {/* Card header with role and meta info */}
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Role icon */}
              <div 
                className={`
                  flex h-5 w-5 items-center justify-center rounded-full
                  ${role === 'user' 
                    ? 'bg-clarit-100 text-clarit-600' 
                    : 'bg-purple-100 text-purple-600'}
                `}
              >
                {role === 'user' ? (
                  <User className="h-3 w-3" />
                ) : (
                  <Bot className="h-3 w-3" />
                )}
              </div>
              
              {/* Role label */}
              <span className={`
                text-xs font-medium uppercase tracking-wide
                ${role === 'user' ? 'text-clarit-600' : 'text-purple-600'}
              `}>
                {role}
              </span>
            </div>

            {/* Meta info row */}
            <div className="flex items-center gap-3">
              {/* Token count */}
              <span className="mono text-[10px] text-gray-400">
                {tokenCount.toLocaleString()} tok
              </span>
              
              {/* Resend count badge - only show if there's redundancy */}
              {hasStack && (
                <div className="flex items-center gap-1 rounded-full bg-waste-100 px-2 py-0.5">
                  <Layers className="h-3 w-3 text-waste-500" />
                  <span className="text-[10px] font-medium text-waste-600">
                    +{effectiveResendCount}
                  </span>
                </div>
              )}
              
              {/* Stateful mode indicator */}
              {isStateful && (
                <div className="flex items-center gap-1 rounded-full bg-clarit-50 px-2 py-0.5">
                  <span className="text-[10px] font-medium text-clarit-600">
                    stateful
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Message content preview */}
          <p className="line-clamp-2 text-sm leading-relaxed text-gray-700">
            {previewText}
          </p>

          {/* Timestamp */}
          {timestamp && (
            <div className="mt-2 text-[10px] text-gray-400">
              {timestamp}
            </div>
          )}
        </motion.div>
      </div>

      {/* 
        Stack depth indicator (visible when not hovered)
        Shows a subtle hint that there's a stack
      */}
      {hasStack && !isHovered && effectiveResendCount > 3 && (
        <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
          {Array.from({ length: Math.min(3, Math.floor(effectiveResendCount / 2)) }, (_, i) => (
            <div 
              key={i}
              className="h-1 w-1 rounded-full bg-waste-300"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default MessageCard;
