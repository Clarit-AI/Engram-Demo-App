import { useMemo, useState } from 'react';
import { useArcStore } from '../store/arcStore';
import { useChatStore } from '../store/chatStore';
import { DEFAULT_LIVE_MODEL } from '../services/inferenceProvider';
import {
  downloadTextFile,
  makePlaybackExportFilename,
  stringifyPlaybackExport,
} from '../utils/export';

const EXPORT_ENDPOINT = '/api/recording/export';

function recordingExportEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_RECORDING_EXPORT === 'true';
}

export function RecordingExportControl() {
  const inferenceMode = useArcStore((s) => s.inferenceMode);
  const messages = useChatStore((s) => s.messages);
  const recordingTurns = useChatStore((s) => s.recordingTurns);
  const [status, setStatus] = useState<'idle' | 'saved' | 'downloaded' | 'error'>('idle');

  const exportTitle = useMemo(() => {
    const firstUser = messages.find((message) => message.role === 'user');
    return firstUser?.content.trim().replace(/\s+/g, ' ').slice(0, 54) || 'Recorded simulation playback';
  }, [messages]);

  if (!recordingExportEnabled()) return null;

  const canExport = messages.some((message) => message.role !== 'system');

  const download = (json: string) => {
    downloadTextFile(makePlaybackExportFilename(exportTitle), json);
    setStatus('downloaded');
  };

  const handleExport = async () => {
    if (!canExport) return;

    const json = stringifyPlaybackExport({
      messages,
      recordingTurns,
      model: DEFAULT_LIVE_MODEL,
      mode: inferenceMode,
      recordingMode: inferenceMode,
      title: exportTitle,
    });

    try {
      const response = await fetch(EXPORT_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: makePlaybackExportFilename(exportTitle),
          payload: JSON.parse(json) as unknown,
        }),
      });

      if (response.ok) {
        setStatus('saved');
        return;
      }
    } catch {
      // Browser download is the guaranteed export path.
    }

    download(json);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={!canExport}
      className="min-h-9 rounded-full px-3 font-mono text-[8px] font-semibold uppercase tracking-[0.14em] disabled:opacity-40"
      style={{
        background: status === 'saved' ? 'rgba(104,250,221,0.12)' : 'rgba(0,163,255,0.08)',
        border: status === 'error' ? '1px solid rgba(220,38,38,0.24)' : '1px solid rgba(0,163,255,0.18)',
        color: status === 'saved' ? 'var(--secondary)' : 'var(--primary)',
      }}
      title="Export the current live chat as a simulation playback JSON file."
    >
      {status === 'saved' ? 'Saved' : status === 'downloaded' ? 'Downloaded' : 'Export playback'}
    </button>
  );
}
