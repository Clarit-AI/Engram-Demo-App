import type { LLMProvider, SendMessageParams, Message, TurnPayload } from './types';

const getConfig = () => ({
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || '',
  baseUrl: import.meta.env.VITE_OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
});

export class OpenRouterProvider implements LLMProvider {
  readonly mode = 'stateless' as const;

  private abortController: AbortController | null = null;
  private _streaming = false;
  private tokenCount = 0;
  private startTime = 0;

  async sendMessage(params: SendMessageParams): Promise<string> {
    const { messages, model, onToken, onComplete, onError } = params;
    const config = getConfig();

    this.abortController = new AbortController();
    this._streaming = true;
    this.tokenCount = 0;
    this.startTime = Date.now();

    const body = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
    };

    let fullResponse = '';

    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (this._streaming) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              this.tokenCount++;
              onToken?.(content);
            }
          } catch {
            // skip invalid JSON chunks
          }
        }
      }

      const latencyMs = Date.now() - this.startTime;
      onComplete?.(fullResponse, { latencyMs, tokenCount: this.tokenCount });
      return fullResponse;
    } catch (error) {
      if ((error as Error).name === 'AbortError') return fullResponse;
      onError?.(error as Error);
      throw error;
    } finally {
      this._streaming = false;
      this.abortController = null;
    }
  }

  getRequestPayload(messages: Message[], model: string): TurnPayload['request'] {
    return {
      body: {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true,
      },
      tokenCount: messages.reduce((sum, m) => sum + m.tokenCount, 0),
      timestamp: Date.now(),
    };
  }

  abort(): void {
    this.abortController?.abort();
    this._streaming = false;
  }

  isStreaming(): boolean {
    return this._streaming;
  }
}

let instance: OpenRouterProvider | null = null;
export function getOpenRouterProvider(): OpenRouterProvider {
  if (!instance) instance = new OpenRouterProvider();
  return instance;
}
