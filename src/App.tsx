import { ReReadStage } from './components/ReReadStage';
import { ChatPanel } from './components/ChatPanel';
import { StatefulReveal } from './components/StatefulReveal';

/**
 * App — root layout for the Clinical Futurist "Re-Read" build.
 *
 * Split 60/40:
 *   left  — dark ReReadStage (JSON re-stream cinematic)
 *   right — light Clinical Futurist chat pane
 *
 * No landing modal, no metrics bar, no footer. The dramatization IS the
 * landing experience — it starts playing on boot.
 */
export default function App() {
  return (
    <div className="flex h-full w-full">
      <div className="w-full lg:w-[60%] h-full">
        <ReReadStage />
      </div>
      <div className="hidden lg:block lg:w-[40%] h-full">
        <ChatPanel />
      </div>
      <StatefulReveal />
    </div>
  );
}
