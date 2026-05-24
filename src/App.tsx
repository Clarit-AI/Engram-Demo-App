import { useEffect, useState } from 'react';
import { ReReadStage } from './components/ReReadStage';
import { ChatPanel } from './components/ChatPanel';
import { StatefulReveal } from './components/StatefulReveal';
import { MobileGuidedComparison } from './components/MobileGuidedComparison';
import { AppHeader } from './components/AppHeader';
import { ConsentGate } from './components/ConsentGate';


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
  const isDesktop = useMediaQuery('(min-width: 1024px)');


  return (
    <div className="flex h-full w-full flex-col overflow-hidden relative">
      <AppHeader mobile={!isDesktop} />
      <div className="min-h-0 flex-1 relative">
        {isDesktop ? <DesktopComparison /> : <MobileGuidedComparison />}
      </div>
      <StatefulReveal />
      <ConsentGate />
    </div>
  );
}

function DesktopComparison() {
  return (
    <div className="flex h-full w-full">
      <div className="h-full w-[60%]">
        <ReReadStage />
      </div>
      <div className="h-full w-[40%]">
        <ChatPanel />
      </div>
    </div>
  );
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
