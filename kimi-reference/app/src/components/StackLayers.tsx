/**
 * StackLayers.tsx
 * 
 * Renders ghost layers behind a message card to visualize payload redundancy.
 * Each layer represents one redundant re-send of the message in stateless mode.
 * 
 * Visual metaphor: Cards with "ghost" copies stacked behind, fanning out on hover.
 */

import { motion } from 'framer-motion';

interface StackLayersProps {
  /** Number of ghost layers to render (represents re-send count) */
  layerCount: number;
  /** Whether the card is currently being hovered */
  isHovered: boolean;
  /** Maximum number of layers to actually render (for performance) */
  maxVisibleLayers?: number;
}

/**
 * Waste color progression for ghost layers (lightest to darkest)
 * Creates depth perception - layers further back are darker/stronger
 */
const WASTE_COLORS = [
  'bg-waste-50',  // layer 0 - barely visible
  'bg-waste-100', // layer 1
  'bg-waste-200', // layer 2
  'bg-waste-300', // layer 3
  'bg-waste-400', // layer 4 - most visible ghost
] as const;

/**
 * Get the background color class for a specific layer index
 */
function getLayerColor(layerIndex: number): string {
  // Use the darkest colors for the most recent layers (higher index)
  // Reverse the index so layer 0 (closest to main card) gets waste-100
  const colorIndex = Math.min(layerIndex, WASTE_COLORS.length - 1);
  return WASTE_COLORS[colorIndex];
}

/**
 * Calculate opacity for a layer based on its depth
 * Layers further from the main card are more transparent
 */
function getLayerOpacity(layerIndex: number, _totalLayers: number): number {
  // Base opacity starts at 0.5 and decreases by 0.04 per layer
  // Minimum opacity is 0.1 to keep layers visible
  const baseOpacity = 0.5;
  const decay = 0.04;
  return Math.max(0.1, baseOpacity - layerIndex * decay);
}

/**
 * Calculate the fan-out offset for hover effect
 * Uses logarithmic scaling to prevent huge gaps when many layers exist
 */
function getHoverOffset(layerIndex: number): number {
  // Logarithmic scaling: offset grows slower as layer count increases
  // This prevents the stack from becoming too tall/spread out
  const baseOffset = 4; // pixels per layer
  const logFactor = Math.log(layerIndex + 2) / Math.log(2);
  return baseOffset * logFactor * (layerIndex + 1);
}

export function StackLayers({ 
  layerCount, 
  isHovered, 
  maxVisibleLayers = 8 
}: StackLayersProps) {
  // Don't render if no layers
  if (layerCount <= 0) return null;

  // Cap visible layers for performance
  const visibleLayers = Math.min(layerCount, maxVisibleLayers);

  return (
    <>
      {Array.from({ length: visibleLayers }, (_, i) => {
        const layerIndex = i;
        const isLastLayer = i === visibleLayers - 1 && layerCount > maxVisibleLayers;
        
        return (
          <GhostLayer
            key={layerIndex}
            layerIndex={layerIndex}
            totalLayers={visibleLayers}
            isHovered={isHovered}
            isLastLayer={isLastLayer}
            remainingCount={layerCount - maxVisibleLayers}
          />
        );
      })}
    </>
  );
}

interface GhostLayerProps {
  layerIndex: number;
  totalLayers: number;
  isHovered: boolean;
  isLastLayer: boolean;
  remainingCount: number;
}

function GhostLayer({ 
  layerIndex, 
  totalLayers, 
  isHovered,
  isLastLayer,
  remainingCount 
}: GhostLayerProps) {
  const colorClass = getLayerColor(layerIndex);
  const opacity = getLayerOpacity(layerIndex, totalLayers);
  
  // Z-index decreases as we go deeper (layer 0 is closest to main card)
  // Main card is z-10, so ghosts range from z-9 down to z-1
  const zIndex = 9 - layerIndex;

  return (
    <motion.div
      className={`
        absolute inset-0 rounded-lg border border-waste-200
        ${colorClass}
      `}
      style={{
        zIndex,
        opacity,
      }}
      initial={false}
      animate={{
        // Fan out on hover - shift down and slightly offset
        y: isHovered ? getHoverOffset(layerIndex) : 0,
        x: isHovered ? layerIndex * 1.5 : 0, // Slight horizontal fan
        scale: isHovered ? 1 - layerIndex * 0.01 : 1, // Slight scale down for depth
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 25,
        mass: 0.8,
        // Stagger the animation slightly for a "riffle" effect
        delay: layerIndex * 0.015,
      }}
    >
      {/* Optional: Show "+N more" indicator on the last visible layer */}
      {isLastLayer && remainingCount > 0 && (
        <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-waste-500 text-[10px] font-medium text-white shadow-sm">
          +{remainingCount}
        </div>
      )}
    </motion.div>
  );
}

export default StackLayers;
