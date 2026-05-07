import { memo, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { AgentRequestBundle } from '../lib/agentRequestBundle';
import { StreamingCursor } from './StreamingCursor';

export interface AgentInboxResponse {
  turn: number;
  content: string;
  visibleChars: number;
  streaming: boolean;
}

interface AgentInboxStageProps {
  bundles: AgentRequestBundle[];
  responses: AgentInboxResponse[];
  readProgress: number;
  humanTyping: boolean;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function speakerFor(role: AgentRequestBundle['sections'][number]['role']): string {
  switch (role) {
    case 'system':
      return 'System';
    case 'assistant':
      return 'Assistant';
    case 'context':
      return 'Context';
    case 'user':
    default:
      return 'Human';
  }
}

function transcriptLength(bundle: AgentRequestBundle): number {
  return bundle.sections.reduce((sum, section, index) => {
    const prefix = index > 0 ? 2 : 0;
    return sum + prefix + `${speakerFor(section.role)}: ${section.content.trim()}`.length;
  }, 0);
}

export const AgentInboxStage = memo(function AgentInboxStage({
  bundles,
  responses,
  readProgress,
  humanTyping,
}: AgentInboxStageProps) {
  const reduced = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const progress = reduced ? 1 : clamp01(readProgress);
  const bundle = bundles[bundles.length - 1] ?? null;
  const responseScrollSize = responses.map((response) => response.visibleChars).join(':');

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  }, [bundle?.turn, bundles.length, progress, responseScrollSize]);

  if (!bundle) {
    return (
      <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[1.75rem] bg-[#0d1117] text-[11px] font-mono uppercase tracking-[0.2em] text-on-surface-dark-faint">
        Waiting for first request...
      </div>
    );
  }

  return (
    <section className="relative h-full overflow-hidden rounded-[1.75rem] bg-[#111820] text-on-surface-dark">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_22%)]" />

      <div ref={viewportRef} className="relative z-10 h-full overflow-auto clinical-scroll px-5 pb-8 pt-8">
        <div className="mx-auto flex max-w-[760px] flex-col gap-4">
          {bundles.map((requestBundle, index) => {
            const active = index === bundles.length - 1;
            return (
              <TurnExchange
                key={`${requestBundle.mode}-${requestBundle.turn}`}
                bundle={requestBundle}
                response={responses.find((reply) => reply.turn === requestBundle.turn)}
                active={active}
                requestProgress={active ? progress : 1}
                humanTyping={active && humanTyping}
              />
            );
          })}

          <div className="h-12" />
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 h-24 bg-gradient-to-t from-[#0d1117] to-transparent" />
    </section>
  );
});

function HumanTypingBubble() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24, mass: 0.8 }}
      className="relative min-h-[48px] max-w-[92%] self-start rounded-[2rem] rounded-tl-md bg-[#e8edf3] px-5 py-4 text-[#18202a] shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]"
    >
      <div className="flex items-center gap-1.5" aria-label="Human is typing">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="block h-1.5 w-1.5 rounded-full bg-[#6b7684]"
            animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }}
            transition={{
              duration: 1.05,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: index * 0.15,
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function TurnExchange({
  bundle,
  response,
  active,
  requestProgress,
  humanTyping,
}: {
  bundle: AgentRequestBundle;
  response: AgentInboxResponse | undefined;
  active: boolean;
  requestProgress: number;
  humanTyping: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {humanTyping ? (
        <HumanTypingBubble />
      ) : (
        <RequestBubble bundle={bundle} active={active} requestProgress={requestProgress} />
      )}
      {response && response.visibleChars > 0 && (
        <AssistantBubble response={response} active={active} />
      )}
    </div>
  );
}

function RequestBubble({
  bundle,
  active,
  requestProgress,
}: {
  bundle: AgentRequestBundle;
  active: boolean;
  requestProgress: number;
}) {
  const isStateful = bundle.mode === 'stateful';
  const fullLength = transcriptLength(bundle);
  const visibleChars = active ? Math.floor(fullLength * clamp01(requestProgress)) : fullLength;
  const typing = active && visibleChars > 0 && visibleChars < fullLength;

  return (
    <motion.div
      initial={active ? { opacity: 0, scale: 0.985 } : false}
      animate={{ opacity: active ? 1 : 0.64, scale: 1 }}
      transition={{ type: 'spring', stiffness: 190, damping: 24, mass: 0.9 }}
      className={[
        'relative min-h-[48px] max-w-[92%] self-start rounded-[2rem] rounded-tl-md px-5 py-4',
        active
          ? 'bg-[#e8edf3] text-[#18202a] shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]'
          : 'bg-[#d4dbe4]/88 text-[#26313e] shadow-[0_10px_28px_-24px_rgba(0,0,0,0.75)]',
      ].join(' ')}
    >
      <p
        className={[
          'whitespace-pre-wrap break-words text-[13px] leading-[1.48]',
          isStateful ? 'font-medium' : '',
        ].join(' ')}
      >
        <TranscriptText bundle={bundle} visibleChars={visibleChars} />
        {typing ? <StreamingCursor /> : null}
      </p>
    </motion.div>
  );
}

function AssistantBubble({
  response,
  active,
}: {
  response: AgentInboxResponse;
  active: boolean;
}) {
  const visibleContent = response.content.slice(0, response.visibleChars);

  return (
    <motion.div
      initial={active ? { opacity: 0, scale: 0.985 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24, mass: 0.75 }}
      className="relative max-w-[84%] self-end rounded-[2rem] rounded-tr-md px-5 py-3 text-[13px] leading-[1.5] text-white shadow-[0_14px_34px_-24px_rgba(0,98,157,0.85)]"
      style={{
        background: 'linear-gradient(135deg, var(--primary) 0%, var(--primary-container) 100%)',
      }}
    >
      <p className="whitespace-pre-wrap break-words">
        {visibleContent}
        {response.streaming && response.visibleChars < response.content.length ? <StreamingCursor /> : null}
      </p>
    </motion.div>
  );
}

function TranscriptText({
  bundle,
  visibleChars,
}: {
  bundle: AgentRequestBundle;
  visibleChars: number;
}) {
  const { segments } = bundle.sections.reduce<{
    remaining: number;
    segments: Array<{
      section: AgentRequestBundle['sections'][number];
      prefix: string;
      visible: string;
    }>;
  }>(
    (acc, section, index) => {
      const prefix = index > 0 ? '\n\n' : '';
      const raw = `${speakerFor(section.role)}: ${section.content.trim()}`;
      const chunkBudget = Math.max(0, acc.remaining - prefix.length);
      const visible = raw.slice(0, chunkBudget);

      return {
        remaining: acc.remaining - prefix.length - visible.length,
        segments: visible
          ? [...acc.segments, { section, prefix, visible }]
          : acc.segments,
      };
    },
    { remaining: visibleChars, segments: [] },
  );

  return (
    <>
      {segments.map(({ section, prefix, visible }) => (
        <TranscriptSpan
          key={section.id}
          section={section}
          prefix={prefix}
          visible={visible}
        />
      ))}
    </>
  );
}

function TranscriptSpan({
  section,
  prefix,
  visible,
}: {
  section: AgentRequestBundle['sections'][number];
  prefix: string;
  visible: string;
}) {
  const isHuman = section.role === 'user';
  const isAssistant = section.role === 'assistant';
  const isSystem = section.role === 'system' || section.role === 'context';

  return (
    <>
      {prefix}
      <span
        className={[
          isHuman ? 'font-semibold' : '',
          isAssistant ? 'italic' : '',
          isSystem ? 'text-[#5f6a78]' : '',
        ].join(' ')}
      >
        {visible}
      </span>
    </>
  );
}
