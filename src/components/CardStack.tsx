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
import { heatTint, roleStripe, type HeatTint } from '../lib/colors';
import { cascade } from '../lib/springs';

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
  tint: HeatTint;
  stripe: string;
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
 * Heat-tint card colors. Role now identified by a left stripe so the
 * thermal ramp owns the whole card background — pile literally heats up.
 */
function getCardColors(resendCount: number, role: 'user' | 'assistant'): CardColors {
  return {
    tint: heatTint(resendCount + 1),
    stripe: roleStripe(role),
  };
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
      transition={cascade}
      className="absolute left-1/2 top-1/2 w-[280px] -translate-x-1/2 -translate-y-1/2"
      style={{
        zIndex: totalCards - index,
        transformOrigin: 'center center',
      }}
    >
      <div
        className="relative rounded-xl border transition-shadow duration-200"
        style={{
          background: `linear-gradient(160deg, ${colors.tint.bgFrom}, ${colors.tint.bgTo})`,
          borderColor: colors.tint.border,
          borderLeft: `3px solid ${colors.stripe}`,
          boxShadow: isTopCard
            ? `0 20px 40px -18px ${colors.tint.shadow}`
            : `0 8px 16px -12px ${colors.tint.shadow}`,
        }}
      >
        {/* Card header */}
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <div style={{ color: colors.stripe }}>
              {card.role === 'user' ? (
                <User className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
            </div>
            <span
              className="text-[11px] font-semibold uppercase tracking-[0.12em] font-mono"
              style={{ color: colors.tint.accent }}
            >
              {card.role}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-text-muted tabular-nums">
              {card.tokens.toLocaleString()} tok
            </span>
            {card.resendCount > 0 && (
              <div
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium font-mono tabular-nums"
                style={{
                  background: `${colors.tint.accent}14`,
                  color: colors.tint.accent,
                }}
              >
                <Layers className="h-3 w-3" />
                ×{card.resendCount + 1}
              </div>
            )}
          </div>
        </div>

        <div className="p-4">
          <p className="line-clamp-3 text-sm leading-relaxed text-text-primary">
            {previewText}
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-black/5 px-4 py-2">
          <span className="text-[10px] text-text-muted font-mono tabular-nums">
            Turn {card.turnNumber}
          </span>
          {isTopCard && (
            <span
              className="flex items-center gap-1 text-[10px] font-semibold tracking-wide"
              style={{ color: 'var(--clarit-600)' }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ background: 'var(--clarit-500)' }}
              />
              Live
            </span>
          )}
        </div>

        {isTopCard && (
          <div className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-white/45 via-transparent to-transparent" />
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
