import type { Message, TurnPayload } from '../services/types';

export function exportPayloadJson(turn: TurnPayload): string {
  return JSON.stringify(turn.request.body, null, 2);
}

export function exportConversationJson(messages: Message[], turnPayloads: TurnPayload[], model: string): string {
  return JSON.stringify({
    conversation: {
      messages: messages.map(m => ({ role: m.role, content: m.content, tokenCount: m.tokenCount })),
      model,
      exportedAt: new Date().toISOString(),
    },
    turnPayloads: turnPayloads.map(tp => ({
      request: { tokenCount: tp.request.tokenCount, messageCount: tp.request.body.messages.length },
      response: tp.response ? { tokenCount: tp.response.tokenCount, duration: tp.response.duration } : null,
      redundantTokens: tp.redundantTokens,
      newTokens: tp.newTokens,
    })),
  }, null, 2);
}

export function exportTranscriptMarkdown(messages: Message[]): string {
  const lines = ['# Conversation Transcript\n'];
  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const label = msg.role === 'user' ? '**You**' : '**Assistant**';
    lines.push(`${label}: ${msg.content}\n`);
  }
  return lines.join('\n');
}
