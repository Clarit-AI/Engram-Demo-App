import { useDemoStore } from './store/demoStore';
import { LandingModal } from './components/LandingModal';
import { MetricsBar } from './components/MetricsBar';
import { PayloadInspector } from './components/PayloadInspector';
import { ChatPanel } from './components/ChatPanel';
import { FooterBar } from './components/FooterBar';

export default function App() {
  const appMode = useDemoStore((s) => s.appMode);

  if (!appMode) {
    return <LandingModal />;
  }

  return (
    <div className="flex flex-col h-full">
      <MetricsBar />
      <main className="flex-1 flex overflow-hidden">
        {/* Desktop: split view */}
        <div className="hidden lg:flex w-full">
          <div className="w-[45%] border-r border-border-default">
            <PayloadInspector />
          </div>
          <div className="w-[55%]">
            <ChatPanel />
          </div>
        </div>
        {/* Mobile: chat view */}
        <div className="lg:hidden w-full">
          <ChatPanel />
        </div>
      </main>
      <FooterBar />
    </div>
  );
}
