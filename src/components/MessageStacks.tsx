/**
 * MessageStacks.tsx
 *
 * Grid-based message stack visualization with real card-shaped ghost layers.
 * Each stack shows actual card rectangles peeking out behind the front card
 * with chaotic random offsets. Stacks grow visually thicker as copy count increases.
 *
 * Features:
 * - Wrapping grid layout that fills rows as conversation progresses
 * - Zoom/pan controls for when rows fill vertical space
 * - Hover tooltips with stack info
 * - Click to expand full message detail
 * - Spring physics animations via Framer Motion
 */

import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';
import { User, Bot, Layers, X, ZoomIn, ZoomOut, Move } from 'lucide-react';

export interface MessageStack {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens: number;
  turnNumber: number;
  cardCount: number;
}

interface MessageStacksProps {
  stacks: MessageStack[];
}

/**
 * Generate a stable hash from a string seed.
 */
function hashSeed(seed: string): number {
  return Math.abs(
    seed.split('').reduce((acc, c) => c.charCodeAt(0) + ((acc << 5) - acc), 0)
  );
}

/**
 * Generate a stable random offset for the entire stack (card position in grid).
 */
function getStackOffset(stackId: string) {
  const h = hashSeed(stackId);
  return {
    x: ((h % 16) - 8),
    y: ((h % 12) - 6),
    rotation: ((h % 10) - 5),
  };
}

/**
 * Generate a unique random offset for each ghost layer.
 * Uses stackId + layerIndex as seed so each layer is chaotic but stable.
 */
function getLayerTransform(stackId: string, layerIndex: number) {
  const h = hashSeed(`${stackId}-layer-${layerIndex}`);
  return {
    x: ((h % 12) - 6),              // -6 to +6px
    y: (((h >> 4) % 8) - 4),        // -4 to +4px
    rotation: (((h >> 8) % 8) - 4), // -4 to +4 degrees
  };
}

/**
 * Get color classes based on stack height (waste intensity) and role.
 */
function getStackColors(cardCount: number, role: 'user' | 'assistant') {
  if (role === 'user') {
    return {
      bg: 'bg-gradient-to-b from-teal-50 to-emerald-100',
      border: 'border-teal-300',
      headerBg: 'bg-teal-100',
      shadow: 'shadow-teal-200',
      labelColor: 'text-teal-600',
    };
  }

  if (cardCount === 1) {
    return {
      bg: 'bg-gradient-to-b from-amber-50 to-orange-100',
      border: 'border-amber-300',
      headerBg: 'bg-amber-100',
      shadow: 'shadow-amber-200',
      labelColor: 'text-amber-600',
    };
  } else if (cardCount <= 3) {
    return {
      bg: 'bg-gradient-to-b from-amber-100 to-orange-200',
      border: 'border-amber-400',
      headerBg: 'bg-amber-200',
      shadow: 'shadow-amber-300',
      labelColor: 'text-amber-700',
    };
  } else if (cardCount <= 6) {
    return {
      bg: 'bg-gradient-to-b from-orange-100 to-amber-300',
      border: 'border-orange-400',
      headerBg: 'bg-orange-200',
      shadow: 'shadow-orange-300',
      labelColor: 'text-orange-700',
    };
  } else {
    return {
      bg: 'bg-gradient-to-b from-orange-200 to-amber-400',
      border: 'border-orange-500',
      headerBg: 'bg-orange-300',
      shadow: 'shadow-orange-400',
      labelColor: 'text-orange-800',
    };
  }
}

// --- AnimatedStackCard ---

interface AnimatedStackCardProps {
  stack: MessageStack;
  offset: { x: number; y: number; rotation: number };
  onClick: () => void;
  onHover: (stack: MessageStack | null, x: number, y: number) => void;
  index: number;
}

const CARD_W = 180;
const CARD_H = 120;
const MAX_GHOST_LAYERS = 6;

function AnimatedStackCard({ stack, offset, onClick, onHover, index }: AnimatedStackCardProps) {
  const colors = getStackColors(stack.cardCount, stack.role);

  const previewText = stack.content.length > 40
    ? stack.content.slice(0, 40) + '...'
    : stack.content;

  const ghostCount = Math.min(stack.cardCount - 1, MAX_GHOST_LAYERS);
  const overflowCount = Math.max(0, stack.cardCount - 1 - MAX_GHOST_LAYERS);

  return (
    <div className="flex flex-col items-center">
      {/* Stack container - needs overflow visible for rotated ghost layers */}
      <motion.div
        initial={{
          opacity: 0,
          y: -200,
          x: 0,
          rotate: 0,
          scale: 0.8,
        }}
        animate={{
          opacity: 1,
          y: offset.y,
          x: offset.x,
          rotate: offset.rotation,
          scale: 1,
        }}
        exit={{
          opacity: 0,
          y: 100,
          rotate: offset.rotation + 10,
          scale: 0.8,
        }}
        transition={{
          type: 'spring',
          stiffness: 400,
          damping: 25,
          mass: 1,
          delay: index * 0.05,
        }}
        whileHover={{ scale: 1.05, zIndex: 100 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        onMouseEnter={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onHover(stack, rect.left + rect.width / 2, rect.top);
        }}
        onMouseLeave={() => onHover(null, 0, 0)}
        className="relative cursor-pointer"
        style={{
          width: CARD_W,
          height: CARD_H,
          isolation: 'isolate',
        }}
      >
        {/* Ghost layers - full card-shaped rectangles behind front card */}
        {Array.from({ length: ghostCount }, (_, i) => {
          const layerT = getLayerTransform(stack.id, i);
          const layerOpacity = 0.8 - i * (0.4 / Math.max(ghostCount, 1));
          const zIndex = MAX_GHOST_LAYERS - i;
          const isLastGhost = i === ghostCount - 1 && overflowCount > 0;

          return (
            <motion.div
              key={`ghost-${i}`}
              className={`absolute inset-0 rounded-lg border-2 ${colors.bg} ${colors.border}`}
              style={{
                zIndex,
                willChange: 'transform',
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: layerOpacity,
                scale: 1,
                x: layerT.x,
                y: layerT.y,
                rotate: layerT.rotation,
              }}
              transition={{
                type: 'spring',
                stiffness: 400,
                damping: 25,
                delay: i * 0.03,
              }}
            >
              {/* Overflow badge on last visible ghost */}
              {isLastGhost && (
                <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-[8px] font-bold text-white shadow-sm">
                  +{overflowCount}
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Front card - on top of ghost layers */}
        <div
          className={`
            absolute inset-0 z-10 flex flex-col rounded-lg border-2 shadow-lg
            ${colors.bg} ${colors.border} ${colors.shadow}
            hover:shadow-xl transition-shadow
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-2.5 pt-2">
            <div className="flex items-center gap-1">
              {stack.role === 'user' ? (
                <User className="h-3 w-3 text-teal-600" />
              ) : (
                <Bot className="h-3 w-3 text-amber-600" />
              )}
              <span className={`text-[9px] font-semibold uppercase ${stack.role === 'user' ? 'text-teal-600' : 'text-amber-600'}`}>
                {stack.role}
              </span>
            </div>

            <div className={`
              flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[8px] font-medium
              ${stack.role === 'user'
                ? 'bg-teal-200 text-teal-800'
                : 'bg-amber-200 text-amber-800'}
            `}>
              <Layers className="h-2 w-2" />
              x{stack.cardCount}
            </div>
          </div>

          {/* Content preview */}
          <p className="flex-1 px-2.5 pt-1 line-clamp-2 text-[10px] leading-tight text-gray-700">
            {previewText}
          </p>

          {/* Footer */}
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="text-[8px] text-gray-400">
              Turn {stack.turnNumber}
            </span>
            <span className="font-mono text-[8px] text-gray-400">
              {stack.tokens} tok
            </span>
          </div>
        </div>
      </motion.div>

      {/* Copies label below stack */}
      <span className={`mt-2 text-[10px] font-medium ${colors.labelColor}`}>
        {stack.cardCount} {stack.cardCount === 1 ? 'copy' : 'copies'}
      </span>
    </div>
  );
}

// --- Tooltip ---

interface TooltipProps {
  stack: MessageStack | null;
  x: number;
  y: number;
}

function Tooltip({ stack, x, y }: TooltipProps) {
  if (!stack) return null;

  const colors = getStackColors(stack.cardCount, stack.role);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.95 }}
      className={`
        fixed z-[1000] pointer-events-none
        rounded-lg border bg-white p-3 shadow-xl
        ${colors.border}
      `}
      style={{
        left: x,
        top: y - 10,
        transform: 'translate(-50%, -100%)',
        minWidth: '200px',
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        {stack.role === 'user' ? (
          <User className="h-4 w-4 text-teal-600" />
        ) : (
          <Bot className="h-4 w-4 text-amber-600" />
        )}
        <span className={`text-xs font-semibold uppercase ${stack.role === 'user' ? 'text-teal-600' : 'text-amber-600'}`}>
          {stack.role}
        </span>
      </div>

      <p className="mb-2 text-xs text-gray-700 line-clamp-3">
        {stack.content}
      </p>

      <div className="space-y-1 border-t pt-2 text-[10px] text-gray-500">
        <div className="flex justify-between">
          <span>Turn:</span>
          <span className="font-mono">#{stack.turnNumber}</span>
        </div>
        <div className="flex justify-between">
          <span>Copies:</span>
          <span className="font-mono">{stack.cardCount}</span>
        </div>
        <div className="flex justify-between">
          <span>Tokens per copy:</span>
          <span className="font-mono">{stack.tokens}</span>
        </div>
        <div className="flex justify-between">
          <span>Total tokens:</span>
          <span className="font-mono">{stack.tokens * stack.cardCount}</span>
        </div>
      </div>
    </motion.div>
  );
}

// --- Detail Modal (simplified, no 3D fan) ---

interface DetailModalProps {
  stack: MessageStack | null;
  onClose: () => void;
}

function DetailModal({ stack, onClose }: DetailModalProps) {
  if (!stack) return null;

  const colors = getStackColors(stack.cardCount, stack.role);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-gray-100 p-1.5 text-gray-500 hover:bg-gray-200"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors.headerBg}`}>
            {stack.role === 'user' ? (
              <User className="h-5 w-5 text-teal-600" />
            ) : (
              <Bot className="h-5 w-5 text-amber-600" />
            )}
          </div>
          <div>
            <h2 className={`text-base font-bold ${stack.role === 'user' ? 'text-teal-700' : 'text-amber-700'}`}>
              {stack.role === 'user' ? 'User Message' : 'Assistant Response'}
            </h2>
            <p className="text-xs text-gray-500">
              Turn #{stack.turnNumber} &middot; {stack.cardCount} copies &middot; {stack.tokens * stack.cardCount} total tokens
            </p>
          </div>
        </div>

        {/* Token breakdown */}
        <div className={`mb-4 rounded-lg border p-3 ${colors.border} bg-gray-50`}>
          <div className="grid grid-cols-3 gap-4 text-center text-xs">
            <div>
              <div className="font-mono text-lg font-bold text-gray-800">{stack.cardCount}</div>
              <div className="text-gray-500">copies</div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-gray-800">{stack.tokens}</div>
              <div className="text-gray-500">tok/copy</div>
            </div>
            <div>
              <div className="font-mono text-lg font-bold text-gray-800">{stack.tokens * stack.cardCount}</div>
              <div className="text-gray-500">total tok</div>
            </div>
          </div>
        </div>

        {/* Full message */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-500 uppercase">Full Message</h3>
          <p className="text-sm leading-relaxed text-gray-700">{stack.content}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// --- Main Component ---

export function MessageStacks({ stacks }: MessageStacksProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredStack, setHoveredStack] = useState<MessageStack | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [expandedStack, setExpandedStack] = useState<MessageStack | null>(null);

  // Zoom/pan state
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [zoomLevel, setZoomLevel] = useState(1);

  const handleZoom = useCallback((delta: number) => {
    const newZoom = Math.max(0.3, Math.min(2, zoomLevel + delta));
    setZoomLevel(newZoom);
    scale.set(newZoom);
  }, [zoomLevel, scale]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  }, [handleZoom]);

  const handleHover = useCallback((stack: MessageStack | null, hx: number, hy: number) => {
    setHoveredStack(stack);
    setTooltipPos({ x: hx, y: hy });
  }, []);

  if (stacks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <Layers className="h-10 w-10 text-gray-300" />
        </div>
        <p className="text-gray-500">No messages yet</p>
        <p className="text-sm text-gray-400">Click "Send Message" to start</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Zoom controls */}
      <div className="absolute right-4 top-4 z-50 flex flex-col gap-2 rounded-lg bg-white/90 p-2 shadow-lg backdrop-blur-sm">
        <button
          onClick={() => handleZoom(0.2)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <div className="flex h-8 items-center justify-center text-xs font-mono">
          {Math.round(zoomLevel * 100)}%
        </div>
        <button
          onClick={() => handleZoom(-0.2)}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            setZoomLevel(1);
            scale.set(1);
            x.set(0);
            y.set(0);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200"
          title="Reset view"
        >
          <Move className="h-4 w-4" />
        </button>
      </div>

      {/* Pan/zoom container */}
      <motion.div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        style={{ x, y, scale }}
        drag
        dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
        dragElastic={0.1}
      >
        {/* Wrapping grid of stacks */}
        <div
          className="grid gap-10 p-10"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          <AnimatePresence mode="popLayout">
            {stacks.map((stack, index) => {
              const offset = getStackOffset(stack.id);

              return (
                <AnimatedStackCard
                  key={stack.id}
                  stack={stack}
                  offset={offset}
                  onClick={() => setExpandedStack(stack)}
                  onHover={handleHover}
                  index={index}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Tooltip */}
      <Tooltip stack={hoveredStack} x={tooltipPos.x} y={tooltipPos.y} />

      {/* Detail modal */}
      <AnimatePresence>
        {expandedStack && (
          <DetailModal
            stack={expandedStack}
            onClose={() => setExpandedStack(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default MessageStacks;
