import { useRef, useEffect } from 'react';
import { useDemoStore } from '../store/demoStore';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { getOpenRouterProvider } from '../services/openRouterProvider';
import { getStatefulStubProvider } from '../services/statefulStubProvider';
import type { TurnPayload, Message } from '../services/types';

export function ChatPanel() {
  const messages = useDemoStore((s) => s.messages);
  const isStreaming = useDemoStore((s) => s.isStreaming);
  const mode = useDemoStore((s) => s.mode);
  const selectedModel = useDemoStore((s) => s.selectedModel);
  const appMode = useDemoStore((s) => s.appMode);
  const demoPlaying = useDemoStore((s) => s.demoPlaying);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (text: string) => {
    if (isStreaming || !text.trim()) return;

    const store = useDemoStore.getState();
    store.setStreaming(true);

    // Add user message
    const userMsg = store.addUserMessage(text);

    // Build full message list for this turn
    const allMessages: Message[] = [store.systemPrompt, ...store.messages];

    // Build request payload
    const provider = mode === 'stateful'
      ? getStatefulStubProvider()
      : getOpenRouterProvider();

    const requestPayload = provider.getRequestPayload(allMessages, selectedModel);

    // Calculate redundancy
    const totalPayloadTokens = requestPayload.tokenCount;
    const newTokens = userMsg.tokenCount;
    const redundantTokens = totalPayloadTokens - newTokens;

    const turnPayload: TurnPayload = {
      id: userMsg.id,
      request: requestPayload,
      response: null,
      redundantTokens: Math.max(redundantTokens, 0),
      newTokens,
      isStreaming: true,
      timestamp: Date.now(),
    };

    store.addTurnPayload(turnPayload);

    // Add empty assistant message for streaming
    store.addAssistantMessage('');

    try {
      await provider.sendMessage({
        messages: allMessages,
        model: selectedModel,
        contextId: mode === 'stateful' ? getStatefulStubProvider().getContextId() : undefined,
        onToken: (token) => {
          useDemoStore.getState().appendToAssistantMessage(token);
        },
        onComplete: (response, metadata) => {
          useDemoStore.getState().updateTurnPayloadResponse(turnPayload.id, {
            body: response,
            duration: metadata.latencyMs,
            tokenCount: metadata.tokenCount,
          });
        },
        onError: (error) => {
          console.error('Stream error:', error);
          useDemoStore.getState().appendToAssistantMessage(`\n\n[Error: ${error.message}]`);
        },
      });
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      store.setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-surface">
      {/* Chat header */}
      <div className="flex-none px-4 py-2 border-b border-border-default flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-primary">Chat</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => useDemoStore.getState().clearConversation()}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            + New conversation
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-text-muted">
            Send a message to begin
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      {(appMode === 'chat' || !demoPlaying) && (
        <ChatInput onSend={handleSend} disabled={isStreaming} />
      )}
    </div>
  );
}