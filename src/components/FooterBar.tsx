import { useDemoStore } from '../store/demoStore';

export function FooterBar() {
  const appMode = useDemoStore((s) => s.appMode);

  return (
    <footer className="flex-none bg-bg-surface border-t border-border-default px-4 py-1.5">
      <div className="flex items-center justify-between text-[11px] text-text-muted max-w-screen-2xl mx-auto">
        <span className="font-semibold text-text-secondary tracking-tight">clarit.ai</span>
        <div className="flex items-center gap-4">
          <span>
            Stateless: <span className="text-waste-500 font-medium">Live</span> (OpenRouter)
          </span>
          <span>
            Stateful: <span className="text-clarit-500 font-medium">Simulated</span>
          </span>
          {appMode === 'demo' && (
            <span className="text-clarit-600 bg-clarit-50 px-1.5 py-0.5 rounded">
              Demo Mode
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}
