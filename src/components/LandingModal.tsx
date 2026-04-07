import { motion } from 'framer-motion';
import { useDemoStore } from '../store/demoStore';
import { loadDemoData, startDemoPlayback } from '../services/demoScript';

export function LandingModal() {
  const setAppMode = useDemoStore((s) => s.setAppMode);

  const handleDemo = async () => {
    setAppMode('demo');
    try {
      const data = await loadDemoData('nvidia-belair');
      startDemoPlayback(data);
    } catch (err) {
      console.error('Failed to load demo:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-bg-surface rounded-2xl shadow-xl p-10 max-w-xl w-full mx-4"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">
            clarit.ai
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            The cure for agent amnesia.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleDemo}
            className="group relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-clarit-500 bg-clarit-50 hover:bg-clarit-100 transition-colors cursor-pointer text-left"
          >
            <div className="text-lg font-semibold text-clarit-700">View a Demo</div>
            <div className="text-sm text-clarit-600 mt-1 text-center">
              Watch a guided demo showing the waste of stateless inference.
            </div>
            <div className="text-xs text-clarit-500 mt-3 font-mono">~40 seconds</div>
          </button>

          <button
            onClick={() => setAppMode('chat')}
            className="group flex flex-col items-center justify-center p-6 rounded-xl border border-border-default bg-bg-surface hover:border-border-strong hover:bg-bg-secondary transition-colors cursor-pointer text-left"
          >
            <div className="text-lg font-semibold text-text-primary">Actually Chat</div>
            <div className="text-sm text-text-secondary mt-1 text-center">
              Chat with a real model. Watch the payload grow.
            </div>
            <div className="text-xs text-text-muted mt-3">No setup required</div>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
