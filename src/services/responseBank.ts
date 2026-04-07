// Pre-written responses for stateful simulation fallback
const responses = [
  "That's a great question. Let me think about that for a moment. The key insight here is that stateful inference fundamentally changes the economics of conversational AI. Instead of reprocessing the entire conversation history each turn, the model maintains its internal state and only needs to process what's new.",
  "Interesting follow-up. You're getting at the core of why this matters at scale. When you multiply the waste across thousands of concurrent users having multi-turn conversations, the token savings become enormous. That's compute that doesn't get burned, latency that doesn't accumulate, and costs that don't spiral.",
  "Exactly right. And this isn't just about cost savings — it's about what becomes possible. When inference is stateful, you can maintain much longer conversations without the quadratic cost growth. Think customer support sessions that go 50+ turns, or AI agents that maintain context across an entire workday.",
  "You've identified the key trade-off. The server needs to hold state in memory, which requires more sophisticated infrastructure. But the memory footprint per conversation is tiny compared to the compute savings from not re-encoding the full context every turn.",
  "Great point about latency. In stateless mode, the time to first token grows linearly with conversation length because the model must reprocess everything. With stateful inference, the time to first token stays roughly constant regardless of how many turns have elapsed. That's the Mamba advantage.",
];

let responseIndex = 0;

export function getBankedResponse(): string {
  const response = responses[responseIndex % responses.length];
  responseIndex++;
  return response;
}

export function resetResponseBank(): void {
  responseIndex = 0;
}
