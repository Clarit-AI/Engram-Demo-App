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

import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion';
import { useState, useRef, useCallback, useEffect } from 'react';
import { User, Bot, Layers, X, ZoomIn, ZoomOut, Move, RotateCcw } from 'lucide-react';

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
 * Larger ranges create the "controlled chaos" look of shuffled card piles.
 */
function getLayerTransform(stackId: string, layerIndex: number) {
  const h = hashSeed(`${stackId}-layer-${layerIndex}`);
  return {
    x: ((h % 30) - 15),              // -15 to +15px
    y: (((h >> 4) % 20) - 10),       // -10 to +10px
    rotation: (((h >> 8) % 16) - 8), // -8 to +8 degrees
  };
}

/**
 * Per-layer color palettes within each role's color family.
 * Each ghost layer picks a different shade for visual variety.
 */
const USER_LAYER_PALETTES = [
  { bg: 'bg-gradient-to-b from-teal-50 to-emerald-100', border: 'border-teal-300' },
  { bg: 'bg-gradient-to-b from-emerald-50 to-teal-100', border: 'border-emerald-300' },
  { bg: 'bg-gradient-to-b from-green-50 to-teal-100', border: 'border-green-300' },
  { bg: 'bg-gradient-to-b from-teal-100 to-emerald-200', border: 'border-teal-400' },
  { bg: 'bg-gradient-to-b from-emerald-100 to-green-200', border: 'border-emerald-400' },
  { bg: 'bg-gradient-to-b from-green-100 to-emerald-100', border: 'border-green-400' },
];

const ASSISTANT_LAYER_PALETTES = [
  { bg: 'bg-gradient-to-b from-amber-50 to-orange-100', border: 'border-amber-300' },
  { bg: 'bg-gradient-to-b from-yellow-50 to-amber-100', border: 'border-yellow-300' },
  { bg: 'bg-gradient-to-b from-orange-50 to-amber-100', border: 'border-orange-300' },
  { bg: 'bg-gradient-to-b from-amber-100 to-yellow-200', border: 'border-amber-400' },
  { bg: 'bg-gradient-to-b from-yellow-100 to-orange-200', border: 'border-yellow-400' },
  { bg: 'bg-gradient-to-b from-orange-100 to-amber-200', border: 'border-orange-400' },
];

function getLayerColors(stackId: string, layerIndex: number, role: 'user' | 'assistant') {
  const h = hashSeed(`${stackId}-color-${layerIndex}`);
  const palette = role === 'user' ? USER_LAYER_PALETTES : ASSISTANT_LAYER_PALETTES;
  return palette[h % palette.length];
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

// --- Riffle fan-out offset (from original StackLayers) ---

/**
 * Logarithmic Y offset for hover riffle fan-out.
 * Layers fan out more dramatically the deeper they are,
 * but the growth rate slows to prevent huge gaps.
 */
function getRiffleFanY(layerIndex: number): number {
  const baseOffset = 4;
  const logFactor = Math.log(layerIndex + 2) / Math.log(2);
  return baseOffset * logFactor * (layerIndex + 1);
}

// --- AnimatedStackCard ---

interface AnimatedStackCardProps {
  stack: MessageStack;
  offset: { x: number; y: number; rotation: number };
  onClick: () => void;
  index: number;
  isNew: boolean; // true = cascade entrance, false = already existed
}

const CARD_W = 180;
const CARD_H = 120;
const MAX_GHOST_LAYERS = 6;

function AnimatedStackCard({ stack, offset, onClick, index, isNew }: AnimatedStackCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const colors = getStackColors(stack.cardCount, stack.role);

  const previewText = stack.content.length > 40
    ? stack.content.slice(0, 40) + '...'
    : stack.content;

  const ghostCount = Math.min(stack.cardCount - 1, MAX_GHOST_LAYERS);
  const overflowCount = Math.max(0, stack.cardCount - 1 - MAX_GHOST_LAYERS);

  return (
    <div className="flex flex-col items-center" style={{ transformStyle: 'preserve-3d' }}>
      {/* Stack container */}
      <motion.div
        initial={isNew ? {
          opacity: 0,
          y: -400,    // new stacks cascade from top of viewport
          x: 0,
          rotate: 0,
          scale: 1.1,
        } : {
          opacity: 1,  // existing stacks don't re-animate
          y: offset.y,
          x: offset.x,
          rotate: offset.rotation,
          scale: 1,
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
          delay: isNew ? index * 0.15 : 0, // stagger new stacks, no delay for existing
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="relative cursor-pointer"
        style={{
          width: CARD_W,
          height: CARD_H,
          transformStyle: 'preserve-3d',
          zIndex: isHovered ? 100 : undefined,
        }}
      >
        {/* Ghost layers - physical pile with riffle fan-out on hover */}
        {Array.from({ length: ghostCount }, (_, i) => {
          const layerT = getLayerTransform(stack.id, i);
          const layerColors = getLayerColors(stack.id, i, stack.role);
          const layerOpacity = 0.85 - i * (0.35 / Math.max(ghostCount, 1));
          const isLastGhost = i === ghostCount - 1 && overflowCount > 0;

          // Pile position: chaotic random offset + physical depth stacking
          const pileX = layerT.x;
          const pileY = layerT.y - (i + 1) * 3;  // stack upward
          const pileZ = -(i + 1) * 5;             // push back in Z
          const pileRotation = layerT.rotation;
          const pileScale = 1 - (i + 1) * 0.015;  // slight shrink for depth

          // Fan-out position: logarithmic riffle spread
          const fanX = i * 1.5;
          const fanY = getRiffleFanY(i);
          const fanZ = -(i + 1) * 5;
          const fanRotation = layerT.rotation * 0.5; // dampen rotation when fanned
          const fanScale = 1 - i * 0.01;

          return (
            <motion.div
              key={`ghost-${i}`}
              className={`absolute inset-0 rounded-lg border-2 shadow-md ${layerColors.bg} ${layerColors.border}`}
              style={{
                willChange: 'transform',
                pointerEvents: 'none',
                transformStyle: 'preserve-3d',
              }}
              initial={{ opacity: 0, scale: 0.9, z: 0 }}
              animate={{
                opacity: layerOpacity,
                scale: isHovered ? fanScale : pileScale,
                x: isHovered ? fanX : pileX,
                y: isHovered ? fanY : pileY,
                z: isHovered ? fanZ : pileZ,
                rotate: isHovered ? fanRotation : pileRotation,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 25,
                mass: 0.8,
                delay: i * 0.015, // riffle stagger
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

        {/* Front card - cascades in from above each time cardCount increases */}
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`front-${stack.id}-${stack.cardCount}`}
            initial={{
              y: -300,
              x: ((hashSeed(`${stack.id}-drop-${stack.cardCount}`) % 40) - 20),
              rotate: ((hashSeed(`${stack.id}-rot-${stack.cardCount}`) % 20) - 10),
              opacity: 0,
              scale: 1.05,
            }}
            animate={{
              y: 0,
              x: 0,
              rotate: 0,
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale: 0.95,
            }}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 22,
              mass: 1,
              delay: index * 0.15, // stagger cascade across stacks
            }}
            className={`
              absolute inset-0 flex flex-col rounded-lg border-2 shadow-xl
              ${colors.bg} ${colors.border} ${colors.shadow}
            `}
            style={{ translateZ: 5, transformStyle: 'preserve-3d' }}
          >
            {/* Shine overlay (glass effect on top card) */}
            <div className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-br from-white/30 via-transparent to-transparent" />

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
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Copies label below stack */}
      <span className={`mt-2 text-[10px] font-medium ${colors.labelColor}`}>
        {stack.cardCount} {stack.cardCount === 1 ? 'copy' : 'copies'}
      </span>
    </div>
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
  const perspectiveRef = useRef<HTMLDivElement>(null);
  const [expandedStack, setExpandedStack] = useState<MessageStack | null>(null);

  // Track known stack IDs to detect new vs existing stacks
  const knownStackIds = useRef<Set<string>>(new Set());
  const newStackIds = useRef<Set<string>>(new Set());

  // Update known/new sets each render
  const currentIds = new Set(stacks.map(s => s.id));
  newStackIds.current = new Set<string>();
  for (const id of currentIds) {
    if (!knownStackIds.current.has(id)) {
      newStackIds.current.add(id);
    }
  }
  // After this render, all current IDs become known
  useEffect(() => {
    knownStackIds.current = currentIds;
  });

  // Zoom/pan state
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [zoomLevel, setZoomLevel] = useState(1);

  // 3D tilt state — springs for smooth interpolation
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const rotateX = useSpring(rawRotateX, { stiffness: 150, damping: 20 });
  const rotateY = useSpring(rawRotateY, { stiffness: 150, damping: 20 });

  // Right-click orbit tracking
  const orbitRef = useRef<{ active: boolean; startX: number; startY: number; baseRX: number; baseRY: number } | null>(null);

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

  // Hover parallax tilt (Option C)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't apply hover tilt while right-click orbiting
    if (orbitRef.current?.active) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width - 0.5;   // -0.5 to 0.5
    const cy = (e.clientY - rect.top) / rect.height - 0.5;
    rawRotateY.set(cx * 25);   // max +/-12.5 degrees
    rawRotateX.set(-cy * 20);  // max +/-10 degrees
  }, [rawRotateX, rawRotateY]);

  const handleMouseLeave = useCallback(() => {
    if (orbitRef.current?.active) return;
    rawRotateX.set(0);
    rawRotateY.set(0);
  }, [rawRotateX, rawRotateY]);

  // Right-click orbit drag (Option A)
  useEffect(() => {
    const el = perspectiveRef.current;
    if (!el) return;

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 2) return; // right-click only
      orbitRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        baseRX: rawRotateX.get(),
        baseRY: rawRotateY.get(),
      };
    };

    const onMouseMove = (e: MouseEvent) => {
      const orbit = orbitRef.current;
      if (!orbit?.active) return;
      const dx = e.clientX - orbit.startX;
      const dy = e.clientY - orbit.startY;
      rawRotateY.set(orbit.baseRY + dx * 0.3);
      rawRotateX.set(orbit.baseRX - dy * 0.3);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 2) return;
      if (orbitRef.current) orbitRef.current.active = false;
    };

    el.addEventListener('contextmenu', onContextMenu);
    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      el.removeEventListener('contextmenu', onContextMenu);
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [rawRotateX, rawRotateY]);

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
    <div
      ref={perspectiveRef}
      className="relative h-full w-full overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ perspective: '1200px', perspectiveOrigin: '50% 50%' }}
    >
      {/* Zoom/orbit controls */}
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
          title="Reset position"
        >
          <Move className="h-4 w-4" />
        </button>
        <button
          onClick={() => {
            rawRotateX.set(0);
            rawRotateY.set(0);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200"
          title="Reset 3D rotation"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Pan/zoom/tilt container */}
      <motion.div
        ref={containerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        style={{ x, y, scale, rotateX, rotateY, transformStyle: 'preserve-3d' }}
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
            transformStyle: 'preserve-3d',
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
                  index={index}
                  isNew={newStackIds.current.has(stack.id)}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

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
