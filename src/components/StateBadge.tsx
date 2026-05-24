/**
 * StateBadge — high-contrast inference mode indicator for both pane subheaders.
 *
 * Agent pane (dark): orange (stateless) or cyan (stateful), with a white dot.
 * Human pane (light): gray (stateless) or cyan (stateful), no dot.
 */
export function StateBadge({
  mode,
  pane,
}: {
  mode: 'stateless' | 'stateful';
  pane: 'agent' | 'human';
}) {
  const isStateful = mode === 'stateful';

  const background = isStateful
    ? '#00A1FF'
    : pane === 'agent'
      ? '#E89460'
      : '#8692A6';

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-[5px] font-mono text-[8px] font-bold uppercase tracking-[0.12em] text-white"
      style={{ background }}
    >
      {pane === 'agent' && (
        <span className="block h-[5px] w-[5px] shrink-0 rounded-full bg-white" />
      )}
      {mode}
    </span>
  );
}
