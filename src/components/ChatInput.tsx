import { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim() && !disabled) {
        onSend(text.trim());
        setText('');
      }
    }
  };

  const handleSend = () => {
    if (text.trim() && !disabled) {
      onSend(text.trim());
      setText('');
    }
  };

  return (
    <div className="flex-none px-4 py-3 border-t border-border-default bg-bg-surface">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Waiting for response...' : 'Type a message...'}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border-default bg-bg-primary px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-clarit-500 focus:ring-1 focus:ring-clarit-500/30 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex-none w-10 h-10 rounded-xl bg-clarit-500 text-white flex items-center justify-center hover:bg-clarit-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 8L14 2L8 14L7 9L2 8Z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>
  );
}
