import { motion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { loadDemoData, startDemoPlayback, stopDemoPlayback } from '../services/demoScript';

export function DemoEndCard() {
  const replayDemo = useDemoStore((s) => s.replayDemo);

  const handleReplay = async () => {
    stopDemoPlayback();
    replayDemo();
    try {
      const data = await loadDemoData('demo-mythology');
      startDemoPlayback(data);
    } catch (err) {
      console.error('Replay failed:', err);
    }
  };

  const handleLive = () => {
    stopDemoPlayback();
    useDemoStore.getState().setAppMode('chat');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex items-center justify-center p-8"
    >
      <div className="bg-bg-surface rounded-2xl border border-border-default shadow-lg p-8 max-w-md text-center">
        <h3 className="text-xl font-bold text-text-primary mb-3">
          That's the difference.
        </h3>
        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          Every turn, stateless inference resends your entire conversation.
          Stateful inference sends only what's new.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={handleLive}
            className="px-5 py-2.5 rounded-xl bg-clarit-500 text-white font-semibold text-sm hover:bg-clarit-600 transition-colors cursor-pointer"
          >
            Try it live →
          </button>
          <button
            onClick={handleReplay}
            className="px-5 py-2.5 rounded-xl border border-border-default text-text-secondary font-medium text-sm hover:bg-bg-secondary transition-colors cursor-pointer"
          >
            Replay demo
          </button>
        </div>
      </div>
    </motion.div>
  );
}
