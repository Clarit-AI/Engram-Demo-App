import { motion } from 'framer-motion';

interface StackLayersProps {
  count: number;
  rifled: boolean;
}

/**
 * Waste color progression for ghost layers (lightest to darkest)
 * Creates depth perception - layers further back are darker/stronger
 */
const WASTE_COLORS = [
  'bg-waste-50',
  'bg-waste-100',
  'bg-waste-200',
  'bg-waste-300',
  'bg-waste-400',
] as const;

function getLayerColor(layerIndex: number): string {
  const colorIndex = Math.min(layerIndex, WASTE_COLORS.length - 1);
  return WASTE_COLORS[colorIndex];
}

function getLayerOpacity(layerIndex: number): number {
  const baseOpacity = 0.5;
  const decay = 0.04;
  return Math.max(0.1, baseOpacity - layerIndex * decay);
}

function getHoverOffset(layerIndex: number): number {
  const baseOffset = 4;
  const logFactor = Math.log(layerIndex + 2) / Math.log(2);
  return baseOffset * logFactor * (layerIndex + 1);
}

export function StackLayers({ count, rifled }: StackLayersProps) {
  if (count <= 0) return null;

  const maxVisibleLayers = 8;
  const visibleLayers = Math.min(count, maxVisibleLayers);

  return (
    <>
      {Array.from({ length: visibleLayers }, (_, i) => {
        const layerIndex = i;
        const isLastLayer = i === visibleLayers - 1 && count > maxVisibleLayers;
        const remainingCount = count - maxVisibleLayers;

        const colorClass = getLayerColor(layerIndex);
        const opacity = getLayerOpacity(layerIndex);

        // Z-index decreases as we go deeper (layer 0 is closest to main card, z-9)
        // Main card is z-10, so ghosts range from z-9 down to z-1
        const zIndex = 9 - layerIndex;

        return (
          <motion.div
            key={`layer-${layerIndex}`}
            className={`absolute inset-0 rounded-xl border border-waste-200 ${colorClass}`}
            style={{
              zIndex,
              opacity,
              pointerEvents: 'none',
            }}
            initial={false}
            animate={{
              // Fan out on hover - shift down and slightly offset
              y: rifled ? getHoverOffset(layerIndex) : 0,
              x: rifled ? layerIndex * 1.5 : 0,
              scale: rifled ? 1 - layerIndex * 0.01 : 1,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              mass: 0.8,
              delay: layerIndex * 0.015,
            }}
          >
            {isLastLayer && remainingCount > 0 && (
              <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-waste-500 text-[10px] font-medium text-white shadow-sm">
                +{remainingCount}
              </div>
            )}
          </motion.div>
        );
      })}
    </>
  );
}
