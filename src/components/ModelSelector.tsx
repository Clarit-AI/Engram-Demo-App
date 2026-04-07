import { useDemoStore } from '../store/demoStore';

const FREE_MODELS = [
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free', name: 'Nemotron 70B', provider: 'OpenRouter' },
  { id: 'google/gemma-3-1-gemma-7b-it:free', name: 'Gemini 2 Flash', provider: 'OpenRouter' },
  { id: 'meta-llama/llama-4.1-8b-instruct:free', name: 'Llama 3.1 8B', provider: 'OpenRouter' },
  { id: 'qwen/qwen3-14b-instruct:free', name: 'Qwen 14B', provider: 'OpenRouter' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B', provider: 'OpenRouter' },
];

export function ModelSelector() {
  const selectedModel = useDemoStore((s) => s.selectedModel);
  const setSelectedModel = useDemoStore((s) => s.setSelectedModel);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selectedModel}
        onChange={(e) => setSelectedModel(e.target.value)}
        className="text-[11px] bg-bg-secondary border border-border-default rounded-lg px-2 py-1 text-text-secondary font-mono focus:border-clarit-500 focus:outline-none focus:ring-1 focus:ring-clarit-500/30 hover:border-border-strong transition-colors cursor-pointer"
      >
        {FREE_MODELS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
    </div>
  );
}
