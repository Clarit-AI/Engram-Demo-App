import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend?: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  displayText?: string;
  sending?: boolean;
}

/**
 * ChatInput — Clinical Futurist "industrial entry" field.
 *
 * Per spec:
 *   - surface-container-highest background
 *   - sm (0.25rem) corners
 *   - 2px primary underline on focus (mimics a signature line on a medical form)
 *   - NO heavy border
 *
 * Auto-grows to a sensible max height; Enter sends (Shift+Enter = newline).
 * Functionally wired up in Phase 7 (PostArcControls enables it for live chat).
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Message the model…',
  displayText,
  sending = false,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const visibleText = displayText ?? text;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [visibleText]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend?.(trimmed);
    setText('');
  };

  return (
    <div className="w-full flex items-end gap-2">
      <div className="flex-1 input-clinical px-3 py-2.5">
        <textarea
          ref={ref}
          value={visibleText}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled || displayText !== undefined}
          placeholder={placeholder}
          rows={1}
          className={[
            'w-full resize-none bg-transparent outline-none font-sans text-[14px] leading-relaxed',
            visibleText.trim() ? 'font-semibold' : 'font-normal',
          ].join(' ')}
          style={{ color: 'var(--on-surface)' }}
        />
      </div>
      <button
        onClick={submit}
        disabled={disabled || displayText !== undefined || !text.trim()}
        className="flex-none h-10 px-4 rounded-full font-sans text-[12px] font-semibold tracking-wide transition-all"
        style={{
          background: (visibleText.trim() || sending) && !disabled
            ? 'linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)'
            : 'var(--surface-container-highest)',
          color: (visibleText.trim() || sending) && !disabled ? '#FFFFFF' : 'var(--text-muted)',
          cursor: text.trim() && !disabled && displayText === undefined ? 'pointer' : 'not-allowed',
          boxShadow: (visibleText.trim() || sending) && !disabled
            ? '0 4px 12px -4px rgba(0, 98, 157, 0.35)'
            : 'none',
          transform: sending ? 'scale(0.96)' : 'scale(1)',
        }}
      >
        Send
      </button>
    </div>
  );
}
