import { useEffect } from 'react';
import { useArcStore } from '../store/arcStore';
import { loadCatalog, loadDemo, capDemoToTurns } from '../services/demoLibrary';

const normalize = (s: string) => s.toLowerCase().replace(/-/g, '');

export function isDeepLinkPath(): boolean {
  const segment = window.location.pathname.split('/')[1] ?? '';
  return segment === 'chat' || segment === 'convo';
}

export function useDeepLink() {
  const setAppMode = useArcStore((s) => s.setAppMode);
  const setInferenceMode = useArcStore((s) => s.setInferenceMode);
  const setActiveDemo = useArcStore((s) => s.setActiveDemo);
  const setPhase = useArcStore((s) => s.setPhase);
  const setCatalog = useArcStore((s) => s.setCatalog);
  const turnsCap = useArcStore((s) => s.turnsCap);

  useEffect(() => {
    const parts = window.location.pathname.split('/');
    const segment = parts[1] ?? '';
    const sub = parts[2] ?? '';

    if (segment === 'chat') {
      setAppMode('chat');
      setInferenceMode(sub === 'stateful' ? 'stateful' : 'stateless');
      setPhase('idle');
      return;
    }

    if (segment === 'convo' && sub) {
      loadCatalog().then((catalog) => {
        setCatalog(catalog);
        const match = catalog.find((d) => normalize(d.key) === normalize(sub));
        if (!match) return;
        return loadDemo(match.key).then((demo) => {
          if (!demo) return;
          const capped = capDemoToTurns(demo.messages, turnsCap);
          setAppMode('demo');
          setActiveDemo(match.key, {
            ...demo,
            messages: capped,
            turnCount: capped.filter((m) => m.role === 'user').length,
          });
        });
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
