/**
 * MessageStacks.tsx
 * 
 * Grid-based message stack visualization with:
 * - Zoom/pan map view (click-drag to pan, scroll to zoom)
 * - Hover tooltips with stack info
 * - 3D expanded view on click showing all cards fanned out
 */

import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { useState, useRef, useCallback, useMemo } from 'react';
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

interface StackTransform {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Generate stable random offsets for visual variety
 */
function getStackOffset(stackId: string): StackTransform {
  const hash = stackId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  const absHash = Math.abs(hash);
  
  return {
    x: ((absHash % 16) - 8),
    y: ((absHash % 12) - 6),
    rotation: ((absHash % 10) - 5),
  };
}

/**
 * Get color based on stack height (waste intensity)
 */
function getStackColors(cardCount: number, role: 'user' | 'assistant'): {
  bg: string;
  border: string;
  headerBg: string;
  shadow: string;
} {
  if (role === 'user') {
    return {
      bg: 'bg-gradient-to-b from-teal-50 to-emerald-100',
      border: 'border-teal-300',
      headerBg: 'bg-teal-100',
      shadow: 'shadow-teal-200',
    };
  }
  
  if (cardCount === 1) {
    return {
      bg: 'bg-gradient-to-b from-amber-50 to-orange-100',
      border: 'border-amber-300',
      headerBg: 'bg-amber-100',
      shadow: 'shadow-amber-200',
    };
  } else if (cardCount <= 3) {
    return {
      bg: 'bg-gradient-to-b from-amber-100 to-orange-200',
      border: 'border-amber-400',
      headerBg: 'bg-amber-200',
      shadow: 'shadow-amber-300',
    };
  } else if (cardCount <= 6) {
    return {
      bg: 'bg-gradient-to-b from-orange-100 to-amber-300',
      border: 'border-orange-400',
      headerBg: 'bg-orange-200',
      shadow: 'shadow-orange-300',
    };
  } else {
    return {
      bg: 'bg-gradient-to-b from-orange-200 to-amber-400',
      border: 'border-orange-500',
      headerBg: 'bg-orange-300',
      shadow: 'shadow-orange-400',
    };
  }
}

// Single stack card component (collapsed view)
interface StackCardProps {
  stack: MessageStack;
  onClick: () => void;
  onHover: (stack: MessageStack | null, x: number, y: number) => void;
}

function StackCard({ stack, onClick, onHover }: StackCardProps) {
  const offset = useMemo(() => getStackOffset(stack.id), [stack.id]);
  const colors = getStackColors(stack.cardCount, stack.role);
  
  const previewText = stack.content.length > 40 
    ? stack.content.slice(0, 40) + '...' 
    : stack.content;

  // Calculate visual height based on card count
  const stackHeight = Math.min(60 + stack.cardCount * 3, 120);

  return (
    <motion.div
      layoutId={`stack-${stack.id}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileHover={{ scale: 1.05, zIndex: 100 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onMouseEnter={(e) => {
        const rect = (e.target as HTMLElement).getBoundingClientRect();
        onHover(stack, rect.left + rect.width / 2, rect.top);
      }}
      onMouseLeave={() => onHover(null, 0, 0)}
      className={`
        relative cursor-pointer
        w-[160px] rounded-lg border-2
        ${colors.bg} ${colors.border} ${colors.shadow}
        shadow-lg transition-shadow hover:shadow-xl
      `}
      style={{
        height: `${stackHeight}px`,
        transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.rotation}deg)`,
      }}
    >
      {/* Stack visualization - multiple thin cards */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        {Array.from({ length: Math.min(stack.cardCount, 8) }, (_, i) => (
          <div
            key={i}
            className={`
              absolute left-1 right-1 h-4 rounded-sm border
              ${colors.border} ${colors.headerBg}
            `}
            style={{
              bottom: `${i * 4 + 4}px`,
              opacity: 0.6 + (i * 0.05),
            }}
          />
        ))}
      </div>

      {/* Top card content */}
      <div className="relative z-10 flex h-full flex-col p-2.5">
        {/* Header */}
        <div className="mb-1 flex items-center justify-between">
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
            ×{stack.cardCount}
          </div>
        </div>
        
        {/* Content preview */}
        <p className="line-clamp-2 text-[10px] leading-tight text-gray-700">
          {previewText}
        </p>
        
        {/* Footer */}
        <div className="mt-auto flex items-center justify-between">
          <span className="text-[8px] text-gray-400">
            Turn {stack.turnNumber}
          </span>
          <span className="font-mono text-[8px] text-gray-400">
            {stack.tokens} tok
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// Tooltip component
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
      
      <div className="mt-2 text-[9px] text-gray-400 italic">
        Click to expand 3D view
      </div>
    </motion.div>
  );
}

// 3D Expanded Stack Modal
interface ExpandedStackModalProps {
  stack: MessageStack | null;
  onClose: () => void;
}

function ExpandedStackModal({ stack, onClose }: ExpandedStackModalProps) {
  if (!stack) return null;

  const colors = getStackColors(stack.cardCount, stack.role);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative max-h-[90vh] w-full max-w-4xl rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${colors.headerBg}`}>
            {stack.role === 'user' ? (
              <User className="h-6 w-6 text-teal-600" />
            ) : (
              <Bot className="h-6 w-6 text-amber-600" />
            )}
          </div>
          <div>
            <h2 className={`text-xl font-bold ${stack.role === 'user' ? 'text-teal-400' : 'text-amber-400'}`}>
              {stack.role === 'user' ? 'User Message' : 'Assistant Response'}
            </h2>
            <p className="text-sm text-gray-400">
              Turn #{stack.turnNumber} • {stack.cardCount} copies • {stack.tokens * stack.cardCount} total tokens
            </p>
          </div>
        </div>

        {/* 3D Card Stack */}
        <div 
          ref={containerRef}
          className="relative flex h-[400px] items-center justify-center"
          style={{ perspective: '1000px' }}
        >
          <div 
            className="relative preserve-3d"
            style={{ 
              transformStyle: 'preserve-3d',
              transform: 'rotateX(20deg) rotateY(-10deg)',
            }}
          >
            {Array.from({ length: Math.min(stack.cardCount, 20) }, (_, i) => {
              const angle = (i - stack.cardCount / 2) * 3;
              const yOffset = i * 2;
              
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: -100, rotateX: -90 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    rotateX: 0,
                    rotateZ: angle,
                    translateY: -yOffset,
                  }}
                  transition={{
                    type: 'spring',
                    stiffness: 300,
                    damping: 20,
                    delay: i * 0.03,
                  }}
                  className={`
                    absolute left-1/2 top-1/2 w-[300px] -translate-x-1/2 -translate-y-1/2
                    rounded-xl border-2 p-4 shadow-2xl
                    ${colors.bg} ${colors.border}
                  `}
                  style={{
                    zIndex: stack.cardCount - i,
                    transformOrigin: 'center bottom',
                  }}
                >
                  {/* Card number */}
                  <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-white">
                    {i + 1}
                  </div>
                  
                  {/* Card content */}
                  <div className="flex flex-col">
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
                    
                    <p className="text-sm text-gray-700 line-clamp-4">
                      {stack.content}
                    </p>
                    
                    <div className="mt-3 flex items-center justify-between border-t pt-2">
                      <span className="text-[10px] text-gray-400">
                        Copy {i + 1} of {stack.cardCount}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {stack.tokens} tokens
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Full message text */}
        <div className="mt-6 rounded-lg bg-white/5 p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-300">Full Message</h3>
          <p className="text-sm text-gray-400">{stack.content}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Main component
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

  // Handle zoom
  const handleZoom = useCallback((delta: number) => {
    const newZoom = Math.max(0.3, Math.min(2, zoomLevel + delta));
    setZoomLevel(newZoom);
    scale.set(newZoom);
  }, [zoomLevel, scale]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    handleZoom(delta);
  }, [handleZoom]);

  // Handle hover
  const handleHover = useCallback((stack: MessageStack | null, x: number, y: number) => {
    setHoveredStack(stack);
    setTooltipPos({ x, y });
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
        {/* Grid of stacks */}
        <div 
          className="grid gap-6 p-8"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          <AnimatePresence mode="popLayout">
            {stacks.map((stack) => (
              <StackCard
                key={stack.id}
                stack={stack}
                onClick={() => setExpandedStack(stack)}
                onHover={handleHover}
              />
            ))}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Tooltip */}
      <Tooltip stack={hoveredStack} x={tooltipPos.x} y={tooltipPos.y} />

      {/* Expanded 3D modal */}
      <AnimatePresence>
        {expandedStack && (
          <ExpandedStackModal
            stack={expandedStack}
            onClose={() => setExpandedStack(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default MessageStacks;
