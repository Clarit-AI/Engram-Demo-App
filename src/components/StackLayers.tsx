import { motion } from 'framer-motion';
import { ghostHeat } from '../lib/colors';
import { riffle } from '../lib/springs';

interface StackLayersProps {
  count: number;
  rifled: boolean;
  /** Front-card heat anchor; each layer is cooled by its depth. */
  resendCount: number;
}

function getLayerOpacity(layerIndex: number): number {
  const baseOpacity = 0.55;
  const decay = 0.045;
  return Math.max(0.1, baseOpacity - layerIndex * decay);
}

function getHoverOffset(layerIndex: number): number {
  const baseOffset = 4;
  const logFactor = Math.log(layerIndex + 2) / Math.log(2);
  return baseOffset * logFactor * (layerIndex + 1);
}

/**
 * Ghost layers beneath a MessageCard. Each layer takes a cooler heat-tint
 * than the card above it — so a heavily-resent message shows a warm front
 * card with progressively cooler history piled behind it, communicating
 * "this message has been hot longer than the others in this pile."
 */
export function StackLayers({ count, rifled, resendCount }: StackLayersProps) {
  if (count <= 0) return null;

  const maxVisibleLayers = 8;
  const visibleLayers = Math.min(count, maxVisibleLayers);

  return (
    <>
      {Array.from({ length: visibleLayers }, (_, i) => {
        const layerIndex = i;
        const isLastLayer = i === visibleLayers - 1 && count > maxVisibleLayers;
        const remainingCount = count - maxVisibleLayers;

        const opacity = getLayerOpacity(layerIndex);
        const tint = ghostHeat(resendCount, layerIndex);

        // z-index decreases with depth (main card is z-10)
        const zIndex = 9 - layerIndex;

        return (
          <motion.div
            key={`layer-${layerIndex}`}
            className="absolute inset-0 rounded-xl ghost-layer"
            style={{
              zIndex,
              opacity,
              pointerEvents: 'none',
              background: `linear-gradient(180deg, ${tint.bgFrom}, ${tint.bgTo})`,
              border: `1px solid ${tint.border}`,
              boxShadow: `0 2px 6px -2px ${tint.shadow}`,
            }}
            initial={false}
            animate={{
              y: rifled ? getHoverOffset(layerIndex) : 0,
              x: rifled ? layerIndex * 1.5 : 0,
              scale: rifled ? 1 - layerIndex * 0.01 : 1,
            }}
            transition={{
              ...riffle,
              delay: layerIndex * 0.015,
            }}
          >
            {isLastLayer && remainingCount > 0 && (
              <div
                className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white shadow-sm font-mono tabular-nums"
                style={{ background: 'var(--burn-500)' }}
              >
                +{remainingCount}
              </div>
            )}
          </motion.div>
        );
      })}
    </>
  );
}
