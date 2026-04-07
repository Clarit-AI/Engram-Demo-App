import { motion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { MessageStacks } from './MessageStacks';
import type { MessageStack } from './MessageStacks';

export function PayloadInspector() {
  const mode = useDemoStore((s) => s.mode);
  const turnPayloads = useDemoStore((s) => s.turnPayloads);
  const currentTurn = useDemoStore((s) => s.currentTurn);
  const currentPayloadTokens = useDemoStore((s) => s.currentPayloadTokens);
  const currentNewTokens = useDemoStore((s) => s.currentNewTokens);

  // Get the current turn's payload messages
  const currentPayload = turnPayloads[turnPayloads.length - 1];
  const payloadMessages = currentPayload?.request.body.messages || [];

  // Build MessageStack[] for MessageStacks visualization
  // Each unique message gets a stack that grows as turns progress
  // Stack N has (currentTurn - N + 1) cards = how many turns it's been included
  const stacks: MessageStack[] = payloadMessages
    .filter((msg) => msg.role !== 'system') // Hide system prompt from display
    .map((msg, idx) => {
      // cardCount = how many times this message has appeared in payloads
      // For message at index idx (0-based), it appears from turn idx+1 to currentTurn
      // So cardCount = currentTurn - idx
      const cardCount = currentTurn - idx;

      return {
        id: `stack-${idx}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        tokens: Math.ceil(msg.content.length / 4),
        turnNumber: idx + 1,
        cardCount,
      };
    });

  const redundantTokens = currentPayloadTokens - currentNewTokens;
  const barTotal = Math.max(currentPayloadTokens, 1);

  return (
    <div className="flex flex-col h-full bg-bg-primary">
      {/* Panel Header */}
      <div className="flex-none px-4 pt-3 pb-2 border-b border-border-default">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-text-primary">Payload Inspector</h2>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
              mode === 'stateful'
                ? 'bg-clarit-100 text-clarit-700'
                : 'bg-waste-100 text-waste-700'
            }`}>
              {mode}
            </span>
            {currentTurn > 0 && (
              <span className="text-xs text-text-muted font-mono">
                Turn {currentTurn}
              </span>
            )}
          </div>
        </div>

        {/* Payload size bar */}
        {currentTurn > 0 && (
          <div className="space-y-1">
            <div className="flex h-2 rounded-full overflow-hidden bg-bg-secondary">
              <motion.div
                className="bg-waste-400"
                initial={{ width: 0 }}
                animate={{ width: `${(redundantTokens / barTotal) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
              <motion.div
                className="bg-clarit-400"
                initial={{ width: 0 }}
                animate={{ width: `${(currentNewTokens / barTotal) * 100}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-waste-400" />
                redundant
              </span>
              <span className="font-mono">
                {currentPayloadTokens.toLocaleString()} tok
              </span>
              <span className="flex items-center gap-1">
                new
                <span className="inline-block w-2 h-2 rounded-full bg-clarit-400" />
              </span>
            </div>
          </div>
        )}
      </div>

      {/* MessageStacks Animation */}
      <div className="flex-1 overflow-hidden">
        {currentTurn === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-text-muted">
            Send a message to see the payload
          </div>
        ) : (
          <MessageStacks stacks={stacks} />
        )}
      </div>

      {/* Footer */}
      <div className="flex-none px-4 py-2 border-t border-border-default text-[11px] text-text-muted">
        {mode === 'stateful'
          ? '✓ Only new message + context_id sent. Server maintains state.'
          : '⚠️ Full conversation context resent every turn.'}
      </div>
    </div>
  );
}