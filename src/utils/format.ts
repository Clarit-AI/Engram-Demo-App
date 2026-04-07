export function formatTokenCount(n: number): string {
  return n.toLocaleString();
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

export function calculateCost(inputTokens: number, pricePerK = 0.01): number {
  return (inputTokens / 1000) * pricePerK;
}

export function calculateRedundancy(totalTokens: number, newTokens: number): number {
  if (totalTokens === 0) return 0;
  return Math.round(((totalTokens - newTokens) / totalTokens) * 100);
}
