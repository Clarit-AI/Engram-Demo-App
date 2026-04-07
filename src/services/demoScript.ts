import { useDemoStore } from '../store/demoStore';
import type { DemoConversation, TurnPayload } from './types';
import { estimateTokens } from './tokenizer';

let playbackTimer: ReturnType<typeof setTimeout> | null = null;
let streamTimer: ReturnType<typeof setInterval> | null = null;

export async function loadDemoData(name: string): Promise<DemoConversation> {
  const resp = await fetch(`/demos/${name}.json`);
  if (!resp.ok) throw new Error(`Demo data not found: ${name}`);
  return resp.json();
}

export function startDemoPlayback(data: DemoConversation) {
  const store = useDemoStore.getState();
  store.startDemo();

  const turns = data.turnPayloads;
  const convMessages = data.conversation.messages;

  let turnIndex = 0;

  function playNextTurn() {
    const s = useDemoStore.getState();
    if (!s.demoPlaying || s.demoPaused || turnIndex >= turns.length) {
      if (turnIndex >= turns.length) {
        // All turns done — auto-switch to stateful after pause
        playbackTimer = setTimeout(() => switchToStateful(data, turns.length), 2000);
      }
      return;
    }

    const turn = turns[turnIndex];

    // Find user/assistant messages for this turn
    // Handles both: [system, user, asst, user, asst] and [user, asst, user, asst]
    const userMsgIndex = convMessages[0]?.role === 'system'
      ? 1 + turnIndex * 2
      : turnIndex * 2;
    const userMsg = convMessages[userMsgIndex];
    const assistantMsg = convMessages[userMsgIndex + 1];

    if (!userMsg || !assistantMsg) {
      turnIndex++;
      playbackTimer = setTimeout(playNextTurn, 500);
      return;
    }

    // Add user message to chat
    const userMessage = useDemoStore.getState().addUserMessage(userMsg.content);

    // Build turn payload from pre-recorded data
    const totalTokens = turn.request.tokenCount;

    const turnPayload: TurnPayload = {
      id: userMessage.id,
      request: {
        body: {
          model: data.conversation.model,
          messages: turn.request.body.messages,
          stream: true,
        },
        tokenCount: totalTokens,
        timestamp: Date.now(),
      },
      response: null,
      redundantTokens: turn.redundantTokens,
      newTokens: turn.newTokens,
      isStreaming: true,
      timestamp: Date.now(),
    };

    useDemoStore.getState().addTurnPayload(turnPayload);

    // Stream assistant response
    streamText(assistantMsg.content, turn.response.duration, () => {
      const latestStore = useDemoStore.getState();
      latestStore.updateTurnPayloadResponse(turnPayload.id, {
        body: assistantMsg.content,
        duration: turn.response.duration,
        tokenCount: turn.response.tokenCount,
      });

      turnIndex++;
      const progress = Math.round((turnIndex / turns.length) * 100);
      useDemoStore.getState().setDemoProgress(progress);

      // Next turn after brief pause
      playbackTimer = setTimeout(playNextTurn, 1500);
    });
  }

  // Start playing after short delay
  playbackTimer = setTimeout(playNextTurn, 1000);
}

function streamText(text: string, targetDurationMs: number, onComplete: () => void) {
  const store = useDemoStore.getState();
  store.addAssistantMessage('');
  store.setStreaming(true);

  const words = text.split(/(\s+)/);
  const interval = Math.max(15, Math.min(50, targetDurationMs / words.length));

  let i = 0;
  streamTimer = setInterval(() => {
    if (i < words.length) {
      useDemoStore.getState().appendToAssistantMessage(words[i]);
      i++;
    } else {
      if (streamTimer) clearInterval(streamTimer);
      streamTimer = null;
      useDemoStore.getState().setStreaming(false);
      onComplete();
    }
  }, interval);
}

function switchToStateful(data: DemoConversation, totalStatelessTurns: number) {
  const store = useDemoStore.getState();
  store.setMode('stateful');

  // Get all user messages for replaying in stateful mode
  const userMsgs = data.conversation.messages.filter(m => m.role === 'user');
  const assistantMsgs = data.conversation.messages.filter(m => m.role === 'assistant');
  const statefulResponses = [
    'With stateful inference, the server already holds our entire conversation context. I only needed to send your latest message — nothing was re-transmitted. Same intelligent response, fraction of the compute cost.',
    'Again, only the new message was sent. The server maintained the full context from previous turns. No redundant tokens, no wasted bandwidth — just efficient, stateful inference.',
    'This is the key difference: each stateless request grows larger as the conversation continues. Stateful inference sends only what\'s new. The efficiency gap widens with every turn.',
  ];

  let statefulTurnIndex = 0;
  const totalTurns = totalStatelessTurns + userMsgs.length;

  function playStatefulTurn() {
    if (statefulTurnIndex >= userMsgs.length) {
      // All stateful turns done
      useDemoStore.getState().setDemoProgress(100);
      return;
    }

    const userMsg = userMsgs[statefulTurnIndex];
    const assistantMsg = assistantMsgs[statefulTurnIndex] || assistantMsgs[assistantMsgs.length - 1];
    const responseText = statefulResponses[Math.min(statefulTurnIndex, statefulResponses.length - 1)];

    playbackTimer = setTimeout(() => {
      const latestStore = useDemoStore.getState();
      if (!latestStore.demoPlaying || latestStore.demoPaused) return;

      const userMessage = latestStore.addUserMessage(userMsg.content);
      const tokenCount = estimateTokens(userMsg.content);

      const turnPayload: TurnPayload = {
        id: userMessage.id,
        request: {
          body: {
            model: data.conversation.model,
            messages: [{ role: 'user', content: userMsg.content }],
            stream: true,
            contextId: 'ctx_demo_stateful',
          },
          tokenCount: tokenCount,
          timestamp: Date.now(),
        },
        response: null,
        redundantTokens: 0,
        newTokens: tokenCount,
        isStreaming: true,
        timestamp: Date.now(),
      };

      latestStore.addTurnPayload(turnPayload);

      // Use the actual assistant response from the conversation
      streamText(assistantMsg?.content || responseText, 2000, () => {
        latestStore.updateTurnPayloadResponse(turnPayload.id, {
          body: assistantMsg?.content || responseText,
          duration: 2000,
          tokenCount: estimateTokens(assistantMsg?.content || responseText),
        });

        statefulTurnIndex++;
        const progress = Math.round(((totalStatelessTurns + statefulTurnIndex) / totalTurns) * 100);
        useDemoStore.getState().setDemoProgress(progress);

        playStatefulTurn();
      });
    }, 1000);
  }

  // Start stateful turns after short delay
  playbackTimer = setTimeout(playStatefulTurn, 1500);
}

export function stopDemoPlayback() {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  if (streamTimer) {
    clearInterval(streamTimer);
    streamTimer = null;
  }
  useDemoStore.getState().setStreaming(false);
}
