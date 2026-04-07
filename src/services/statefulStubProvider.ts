import type { LLMProvider, SendMessageParams, Message, TurnPayload } from './types';
import { getOpenRouterProvider } from './openRouterProvider';
import { estimateTokens } from './tokenizer';

export class StatefulStubProvider implements LLMProvider {
  readonly mode = 'stateful' as const;

  private contextId: string;
  private _streaming = false;

  constructor() {
    this.contextId = `ctx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  getContextId(): string {
    return this.contextId;
  }

  async sendMessage(params: SendMessageParams): Promise<string> {
    this._streaming = true;
    try {
      // Shadow call: use real OpenRouter with full history for coherent responses
      const provider = getOpenRouterProvider();
      const result = await provider.sendMessage({
        messages: params.messages,
        model: params.model,
        onToken: params.onToken,
        onComplete: params.onComplete,
        onError: params.onError,
      });
      return result;
    } finally {
      this._streaming = false;
    }
  }

  getRequestPayload(messages: Message[], model: string): TurnPayload['request'] {
    // Show ONLY the last user message + contextId
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const content = lastUserMsg?.content || '';

    return {
      body: {
        model,
        messages: lastUserMsg ? [{ role: 'user', content }] : [],
        stream: true,
        contextId: this.contextId,
      },
      tokenCount: estimateTokens(content),
      timestamp: Date.now(),
    };
  }

  abort(): void {
    getOpenRouterProvider().abort();
    this._streaming = false;
  }

  isStreaming(): boolean {
    return this._streaming;
  }
}

let instance: StatefulStubProvider | null = null;
export function getStatefulStubProvider(): StatefulStubProvider {
  if (!instance) instance = new StatefulStubProvider();
  return instance;
}
