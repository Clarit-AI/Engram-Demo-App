/**
 * Message Stacks Animation Demo
 * 
 * Each unique message has its own stack of cards.
 * When a new message is sent:
 * - All existing stacks get +1 card (representing the re-send)
 * - New message starts a new stack with 1 card
 * 
 * Example progression:
 * Turn 1: [Stack A: 1 card]
 * Turn 2: [Stack A: 2 cards] [Stack B: 1 card]
 * Turn 3: [Stack A: 3 cards] [Stack B: 2 cards] [Stack C: 1 card]
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageStacks, type MessageStack } from './components/MessageStacks';
import { 
  Layers, 
  Zap, 
  Activity, 
  RefreshCw, 
  Play, 
  RotateCcw,
  Info,
  ChevronRight,
  Server,
  Cpu,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import './App.css';

// Sample conversation messages
const SAMPLE_MESSAGES = [
  { role: 'user' as const, content: 'Now this is a story all about how my life got flipped, turned upside down', tokens: 15 },
  { role: 'assistant' as const, content: 'That sounds incredibly disorienting—like your whole world shifted in an instant.', tokens: 32 },
  { role: 'user' as const, content: 'And I\'d like to take a minute, just sit right there, I\'ll tell you how I became the prince', tokens: 24 },
  { role: 'assistant' as const, content: 'Got it. So their story begins in West Philadelphia—born and raised there.', tokens: 28 },
  { role: 'user' as const, content: 'In West Philadelphia, born and raised, on the playground is where I spent most of my days', tokens: 18 },
  { role: 'assistant' as const, content: 'Now it shifts to their present—how they spend their time: relaxing, taking it easy.', tokens: 35 },
  { role: 'user' as const, content: 'Chillin\' out, maxin\', relaxin\' all cool, and all shootin\' some b-ball outside', tokens: 16 },
  { role: 'assistant' as const, content: 'When a couple of guys who were up to no good started making trouble in my neighborhood', tokens: 15 },
];

export default function App() {
  const [stacks, setStacks] = useState<MessageStack[]>([]);
  const [isStateful, setIsStateful] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const turnCountRef = useRef(0);

  // Add a new message stack
  const addMessage = useCallback(() => {
    turnCountRef.current += 1;
    const newTurn = turnCountRef.current;
    const sample = SAMPLE_MESSAGES[(newTurn - 1) % SAMPLE_MESSAGES.length];
    
    const newStack: MessageStack = {
      id: `stack-${Date.now()}-${newTurn}`,
      role: sample.role,
      content: sample.content,
      tokens: sample.tokens,
      turnNumber: newTurn,
      cardCount: 1, // New stack starts with 1 card
    };

    setStacks(prev => {
      // In stateless mode, increment cardCount for ALL existing stacks
      // (each previous message gets re-sent)
      const updated = isStateful 
        ? prev.map(s => ({ ...s }))
        : prev.map(s => ({ ...s, cardCount: s.cardCount + 1 }));
      
      return [...updated, newStack];
    });
  }, [isStateful]);

  // Reset the demo
  const reset = useCallback(() => {
    setStacks([]);
    turnCountRef.current = 0;
    setIsSimulating(false);
  }, []);

  // Auto-simulate conversation
  const simulateConversation = useCallback(async () => {
    if (isSimulating) return;
    setIsSimulating(true);
    reset();

    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 800));
      addMessage();
    }

    setIsSimulating(false);
  }, [addMessage, isSimulating, reset]);

  // Calculate statistics
  const totalCards = stacks.reduce((sum, s) => sum + s.cardCount, 0);
  const totalTokens = stacks.reduce((sum, s) => sum + s.tokens * s.cardCount, 0);
  const originalTokens = stacks.reduce((sum, s) => sum + s.tokens, 0);
  const wastedTokens = totalTokens - originalTokens;
  const redundancyRatio = originalTokens > 0 
    ? ((wastedTokens / originalTokens) * 100).toFixed(0)
    : '0';

  // Get the latest stack
  const latestStack = stacks[stacks.length - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 px-6 py-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Message Stacks</h1>
              <p className="text-xs text-gray-500">Each message grows its own stack</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2 rounded-lg border bg-gray-100 p-1">
              <button
                onClick={() => setIsStateful(false)}
                className={`
                  flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all
                  ${!isStateful 
                    ? 'bg-white text-amber-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                <Activity className="h-4 w-4" />
                Stateless
              </button>
              <button
                onClick={() => setIsStateful(true)}
                className={`
                  flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all
                  ${isStateful 
                    ? 'bg-white text-teal-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'}
                `}
              >
                <Server className="h-4 w-4" />
                Stateful
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl p-6">
        <div className="grid gap-6 lg:grid-cols-4">
          
          {/* Left panel: Message Stacks */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border bg-white/80 shadow-sm backdrop-blur-sm">
              {/* Panel header */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-gray-400" />
                  <h2 className="font-semibold text-gray-900">Payload Visualization</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {stacks.length} messages
                  </span>
                  <span className="text-xs text-gray-400">|</span>
                  <span className="text-xs text-gray-500">
                    {totalCards} total cards
                  </span>
                  {!isStateful && stacks.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                      {redundancyRatio}% redundancy
                    </span>
                  )}
                </div>
              </div>

              {/* Stacks display */}
              <div className="min-h-[500px]">
                <MessageStacks stacks={stacks} />
              </div>
            </div>
          </div>

          {/* Right panel: Controls & Stats */}
          <div className="space-y-4">
            {/* Controls */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Zap className="h-4 w-4 text-amber-500" />
                Controls
              </h3>
              
              <div className="space-y-2">
                <button
                  onClick={addMessage}
                  disabled={isSimulating || stacks.length >= 12}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw className={`h-4 w-4 ${isSimulating ? 'animate-spin' : ''}`} />
                  Send Message
                </button>

                <button
                  onClick={simulateConversation}
                  disabled={isSimulating}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                  {isSimulating ? 'Simulating...' : 'Auto Simulate'}
                </button>

                <button
                  onClick={reset}
                  disabled={isSimulating || stacks.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>
              </div>
            </div>

            {/* Latest Stack Info */}
            <AnimatePresence mode="wait">
              {latestStack && (
                <motion.div
                  key={latestStack.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-xl border bg-gradient-to-br from-indigo-50 to-purple-50 p-4"
                >
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-indigo-900">
                    <TrendingUp className="h-4 w-4" />
                    Latest Message
                  </h3>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-indigo-600">Role</span>
                      <span className="text-xs font-medium capitalize text-indigo-900">
                        {latestStack.role}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-indigo-600">Cards</span>
                      <span className="font-mono text-xs text-indigo-900">
                        {latestStack.cardCount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-indigo-600">Tokens</span>
                      <span className="font-mono text-xs text-indigo-900">
                        {latestStack.tokens}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-indigo-600">Turn</span>
                      <span className="font-mono text-xs text-indigo-900">
                        #{latestStack.turnNumber}
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Stats */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                Statistics
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Messages</span>
                  <span className="font-mono text-sm font-medium">{stacks.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Total Cards</span>
                  <span className="font-mono text-sm font-medium">{totalCards}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Original Tokens</span>
                  <span className="font-mono text-sm font-medium">{originalTokens.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Total Sent</span>
                  <span className="font-mono text-sm font-medium">{totalTokens.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Wasted</span>
                  <span className={`font-mono text-sm font-medium ${wastedTokens > 0 ? 'text-amber-600' : ''}`}>
                    {wastedTokens.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Redundancy</span>
                  <span className={`font-mono text-sm font-medium ${!isStateful && parseInt(redundancyRatio) > 0 ? 'text-amber-600' : 'text-teal-600'}`}>
                    {redundancyRatio}%
                  </span>
                </div>
              </div>
            </div>

            {/* Explanation */}
            <div className="rounded-xl border bg-amber-50 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Info className="h-4 w-4" />
                How it works
              </h3>
              <p className="text-xs leading-relaxed text-amber-800">
                In <strong>stateless mode</strong>, every new message causes ALL previous 
                messages to be re-sent. Each message stack grows taller with each turn, 
                visualizing the exponential payload growth.
              </p>
              <div className="mt-3 flex items-center gap-1 text-xs text-amber-700">
                <span>Watch stacks grow as you send messages</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            </div>

            {/* Example */}
            <div className="rounded-xl border bg-gray-50 p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Example Progression
              </h3>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="w-12 text-gray-400">Turn 1</span>
                  <span>[A: 1]</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-gray-400">Turn 2</span>
                  <span>[A: 2] [B: 1]</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-12 text-gray-400">Turn 3</span>
                  <span>[A: 3] [B: 2] [C: 1]</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
