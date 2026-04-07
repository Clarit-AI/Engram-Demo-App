/**
 * CardStack.tsx
 *
 * A physical card stack where each message lands as a new card.
 * Cards pile up with slight random offsets and rotations.
 * Each card shows truncated message content + live resend count.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { User, Bot, Layers } from 'lucide-react';

export interface StackCard {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokens: number;
  resendCount: number;
  turnNumber: number;
}

interface CardStackProps {
  cards: StackCard[];
  maxVisibleCards?: number;
}

interface CardTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
}

interface CardColors {
  bg: string;
  border: string;
  badge: string;
  icon: string;
}

/**
 * Generate stable random offsets for a card based on its ID
 * This ensures the card doesn't jitter when re-rendering
 */
function getCardTransform(cardId: string, index: number): CardTransform {
  // Use the card ID to generate stable pseudo-random values
  const hash = cardId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const absHash = Math.abs(hash);

  // Cards further back in the stack have more pronounced offsets
  const depthFactor = Math.min(index * 0.15, 0.8);

  return {
    x: ((absHash % 40) - 20) * (1 + depthFactor), // -20 to +20px, increasing with depth
    y: -index * 3 - ((absHash % 15)), // Stack upward with slight variation
    rotation: ((absHash % 16) - 8) * (1 + depthFactor * 0.5), // -8 to +8 degrees
    scale: 1 - index * 0.02, // Slight scale down for depth
  };
}

/**
 * Get color scheme based on resend count (waste intensity)
 */
function getCardColors(resendCount: number, role: 'user' | 'assistant'): CardColors {
  if (role === 'user') {
    // User cards - teal/green clarit theme
    return {
      bg: 'bg-gradient-to-br from-teal-50 to-emerald-50',
      border: 'border-teal-200',
      badge: 'bg-teal-100 text-teal-700',
      icon: 'text-teal-600',
    };
  }

  // Assistant cards - amber/orange waste theme with intensity based on resend count
  if (resendCount === 0) {
    return {
      bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
      border: 'border-amber-200',
      badge: 'bg-amber-100 text-amber-700',
      icon: 'text-amber-600',
    };
  } else if (resendCount <= 2) {
    return {
      bg: 'bg-gradient-to-br from-amber-100 to-orange-100',
      border: 'border-amber-300',
      badge: 'bg-amber-200 text-amber-800',
      icon: 'text-amber-700',
    };
  } else if (resendCount <= 5) {
    return {
      bg: 'bg-gradient-to-br from-orange-100 to-amber-200',
      border: 'border-orange-300',
      badge: 'bg-orange-200 text-orange-800',
      icon: 'text-orange-700',
    };
  } else {
    return {
      bg: 'bg-gradient-to-br from-orange-200 to-amber-300',
      border: 'border-orange-400',
      badge: 'bg-orange-300 text-orange-900',
      icon: 'text-orange-800',
    };
  }
}

interface StackedCardProps {
  card: StackCard;
  transform: CardTransform;
  colors: CardColors;
  isTopCard: boolean;
  index: number;
  totalCards: number;
}

function StackedCard({
  card,
  transform,
  colors,
  isTopCard,
  index,
  totalCards
}: StackedCardProps) {
  const previewText = card.content.length > 60
    ? card.content.slice(0, 60) + '...'
    : card.content;

  return (
    <motion.div
      layoutId={card.id}
      initial={{
        opacity: 0,
        y: -300,
        x: 0,
        rotate: 0,
        scale: 1.1,
      }}
      animate={{
        opacity: 1,
        y: transform.y,
        x: transform.x,
        rotate: transform.rotation,
        scale: transform.scale,
      }}
      exit={{
        opacity: 0,
        y: 100,
        rotate: transform.rotation + 10,
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
        mass: 1,
      }}
      className="absolute left-1/2 top-1/2 w-[280px] -translate-x-1/2 -translate-y-1/2"
      style={{
        zIndex: totalCards - index,
        transformOrigin: 'center center',
      }}
    >
      <div
        className={`
          relative rounded-xl border-2 shadow-lg
          ${colors.bg} ${colors.border}
          ${isTopCard ? 'shadow-xl' : 'shadow-md'}
          transition-shadow duration-200
        `}
      >
        {/* Card header */}
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className={`${colors.icon}`}>
              {card.role === 'user' ? (
                <User className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <span className={`text-xs font-semibold uppercase tracking-wide ${colors.icon}`}>
              {card.role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Token count */}
            <span className="font-mono text-[10px] text-gray-500">
              {card.tokens.toLocaleString()} tok
            </span>

            {/* Resend count badge */}
            {card.resendCount > 0 && (
              <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.badge}`}>
                <Layers className="h-3 w-3" />
                ×{card.resendCount + 1}
              </div>
            )}
          </div>
        </div>

        {/* Card content */}
        <div className="p-4">
          <p className="line-clamp-3 text-sm leading-relaxed text-gray-700">
            {previewText}
          </p>
        </div>

        {/* Card footer */}
        <div className="flex items-center justify-between border-t border-black/5 px-4 py-2">
          <span className="text-[10px] text-gray-400">
            Turn {card.turnNumber}
          </span>

          {/* Live indicator for top card */}
          {isTopCard && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
              Live
            </span>
          )}
        </div>

        {/* Card shine effect for top card */}
        {isTopCard && (
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/40 via-transparent to-transparent" />
        )}
      </div>
    </motion.div>
  );
}

export function CardStack({ cards, maxVisibleCards = 12 }: CardStackProps) {
  // Show most recent cards on top
  const visibleCards = useMemo(() => {
    return cards.slice(-maxVisibleCards).reverse();
  }, [cards, maxVisibleCards]);

  const hiddenCount = Math.max(0, cards.length - maxVisibleCards);

  if (cards.length === 0) {
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
    <div className="relative flex h-full items-center justify-center">
      {/* Hidden cards indicator */}
      {hiddenCount > 0 && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-gray-800 px-3 py-1 text-xs text-white">
          +{hiddenCount} more
        </div>
      )}

      {/* Card stack container */}
      <div className="relative h-[280px] w-[320px]">
        <AnimatePresence mode="popLayout">
          {visibleCards.map((card, index) => {
            const transform = getCardTransform(card.id, index);
            const colors = getCardColors(card.resendCount, card.role);
            const isTopCard = index === 0;

            return (
              <StackedCard
                key={card.id}
                card={card}
                transform={transform}
                colors={colors}
                isTopCard={isTopCard}
                index={index}
                totalCards={visibleCards.length}
              />
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default CardStack;
