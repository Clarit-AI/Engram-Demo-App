import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { motion } from 'framer-motion';

export interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  /** When true, mounts with an entry spring. Once false (seen before), renders without animating. */
  isNew?: boolean;
  /** Optional cursor element to render at end (for streaming assistant). */
  trailingCursor?: React.ReactNode;
}

/**
 * ChatMessage — a single chat bubble. Two variants per DESIGN.md Clinical Futurist:
 *
 *   USER: signature-gradient pill (135° primary → primary-container), white text,
 *         `full` roundedness, right-aligned. The "engaged tech" accent moment.
 *
 *   ASSISTANT: surface-container-lowest card with spec ambient shadow
 *         (32px blur, -4px spread, on-surface 6% opacity), lg roundedness,
 *         on-surface text. Left-aligned. No border (no-line rule).
 *
 * Both use body-copy Geist; numerics/technical spans should opt into mono
 * via explicit classes in the content if ever mixed in.
 */
export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  isNew = false,
  trailingCursor,
}: ChatMessageProps) {
  if (role === 'user') {
    return (
      <motion.div
        className="flex justify-end"
        initial={isNew ? { opacity: 0, y: 8, scale: 0.96 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 340, damping: 24, mass: 0.7 }}
      >
        <div
          className="max-w-[78%] rounded-full px-4 py-2 text-[14px] leading-relaxed whitespace-pre-wrap"
          style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)',
            color: '#FFFFFF',
            boxShadow: '0 4px 14px -6px rgba(0, 98, 157, 0.35)',
          }}
        >
          {content}
          {trailingCursor}
        </div>
      </motion.div>
    );
  }

  // assistant
  return (
    <motion.div
      className="flex justify-start"
      initial={isNew ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, mass: 0.8 }}
    >
      <div
        className="md-content max-w-[88%] rounded-2xl px-5 py-3 text-[14px] leading-relaxed ambient-shadow"
        style={{
          background: 'var(--surface-container-lowest)',
          color: 'var(--on-surface)',
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
        >
          {content}
        </ReactMarkdown>
        {trailingCursor}
      </div>
    </motion.div>
  );
});
