import { useDemoStore } from '../store/demoStore';
import { stopDemoPlayback } from '../services/demoScript';

export function DemoPlaybackControls() {
  const demoPlaying = useDemoStore((s) => s.demoPlaying);
  const demoPaused = useDemoStore((s) => s.demoPaused);
  const demoProgress = useDemoStore((s) => s.demoProgress);
  const pauseDemo = useDemoStore((s) => s.pauseDemo);
  const resumeDemo = useDemoStore((s) => s.resumeDemo);

  if (!demoPlaying) return null;

  return (
    <div className="px-4 pb-2 pt-1 border-t border-border-default bg-bg-surface">
      {/* Progress bar */}
      <div className="w-full h-1 bg-bg-secondary rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-clarit-400 rounded-full transition-all duration-300"
          style={{ width: `${demoProgress}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (demoPaused) {
              resumeDemo();
            } else {
              pauseDemo();
            }
          }}
          className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
          {demoPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <span className="text-[10px] text-text-muted font-mono">
          {demoProgress}%
        </span>
        <button
          onClick={() => {
            stopDemoPlayback();
            useDemoStore.getState().setMode('stateful');
          }}
          className="text-xs text-clarit-600 hover:text-clarit-700 font-medium cursor-pointer"
        >
          Skip to stateful →
        </button>
      </div>
    </div>
  );
}
