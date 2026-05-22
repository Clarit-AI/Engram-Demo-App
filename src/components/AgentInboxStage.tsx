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

function markdownHeadingFor(role: AgentRequestBundle['sections'][number]['role']): string {
  switch (role) {
    case 'system':
      return '## System';
    case 'assistant':
      return '## Assistant';
    case 'context':
      return '## Context';
    case 'user':
    default:
      return '## Human';
  }
}

function sectionText(bundle: AgentRequestBundle, section: AgentRequestBundle['sections'][number]): string {
  if (bundle.mode === 'stateless') {
    return `${markdownHeadingFor(section.role)}\n\n${section.content.trim()}`;
  }
  return `${speakerFor(section.role)}: ${section.content.trim()}`;
}

function transcriptLength(bundle: AgentRequestBundle): number {
  return bundle.sections.reduce((sum, section, index) => {
    const prefix = index > 0 ? 2 : 0;
    return sum + prefix + sectionText(bundle, section).length;
  }, 0);
}

type VisibleTranscriptSection = {
  section: AgentRequestBundle['sections'][number];
  prefix: string;
  visible: string;
};

function visibleTranscriptSections(
  bundle: AgentRequestBundle,
  visibleChars: number,
): VisibleTranscriptSection[] {
  return bundle.sections.reduce<{
    remaining: number;
    segments: VisibleTranscriptSection[];
  }>(
    (acc, section, index) => {
      const prefix = index > 0 ? '\n\n' : '';
      const raw = sectionText(bundle, section);
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
  ).segments;
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
                currentTurn={bundle.turn}
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
  currentTurn,
  requestProgress,
  humanTyping,
}: {
  bundle: AgentRequestBundle;
  response: AgentInboxResponse | undefined;
  active: boolean;
  currentTurn: number;
  requestProgress: number;
  humanTyping: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {humanTyping ? (
        <HumanTypingBubble />
      ) : (
        <RequestBubble
          bundle={bundle}
          active={active}
          currentTurn={currentTurn}
          requestProgress={requestProgress}
        />
      )}
      {response && response.visibleChars > 0 && (
        <div data-response-visible-chars={response.visibleChars}><AssistantBubble response={response} active={active} /></div>
      )}
    </div>
  );
}

function RequestBubble({
  bundle,
  active,
  currentTurn,
  requestProgress,
}: {
  bundle: AgentRequestBundle;
  active: boolean;
  currentTurn: number;
  requestProgress: number;
}) {
  const isStateful = bundle.mode === 'stateful';
  const isStateless = bundle.mode === 'stateless';
  const fullLength = transcriptLength(bundle);
  const visibleChars = active ? Math.floor(fullLength * clamp01(requestProgress)) : fullLength;
  const typing = active && visibleChars > 0 && visibleChars < fullLength;

  return (
    <motion.div
      initial={active ? { opacity: 0, scale: 0.985 } : false}
      animate={{ opacity: active ? 1 : 0.64, scale: 1 }}
      transition={{ type: 'spring', stiffness: 190, damping: 24, mass: 0.9 }}
      className={[
        'relative min-h-[48px] max-w-[92%] overflow-visible self-start rounded-[2rem] rounded-tl-md px-5 py-4',
        active
          ? 'bg-[#e8edf3] text-[#18202a] shadow-[0_20px_50px_-30px_rgba(0,0,0,0.8)]'
          : 'bg-[#d4dbe4]/88 text-[#26313e] shadow-[0_10px_28px_-24px_rgba(0,0,0,0.75)]',
      ].join(' ')}
    >
      {isStateless && (
        <div
          className="mb-3 flex items-center justify-between gap-3 border-b pb-2"
          style={{ borderColor: 'rgba(0,98,157,0.18)' }}
        >
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-[#00629d]">
            Full transcript payload
          </span>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6f7b89]">
            + latest message
          </span>
        </div>
      )}
      {isStateless ? (
        <StatelessMarkdownTranscript
          bundle={bundle}
          currentTurn={currentTurn}
          visibleChars={visibleChars}
          typing={typing}
        />
      ) : (
        <p
          className={[
            'whitespace-pre-wrap break-words text-[13px] leading-[1.48]',
            isStateful ? 'font-medium' : '',
          ].join(' ')}
        >
          <TranscriptText bundle={bundle} visibleChars={visibleChars} />
          {typing ? <StreamingCursor /> : null}
        </p>
      )}
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
  const segments = visibleTranscriptSections(bundle, visibleChars);

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

type MarkdownGroup =
  | {
      type: 'preface';
      key: string;
      segments: VisibleTranscriptSection[];
    }
  | {
      type: 'exchange';
      key: string;
      turn: number;
      tokens: number;
      latest: boolean;
      latestBodyVisible: boolean;
      segments: VisibleTranscriptSection[];
    };

function exchangeTurn(section: AgentRequestBundle['sections'][number], fallback: number): number {
  const match = section.label.match(/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

function hasVisibleBody(visible: string): boolean {
  const marker = '\n\n';
  const bodyStart = visible.indexOf(marker);
  return bodyStart >= 0 && visible.slice(bodyStart + marker.length).trim().length > 0;
}

function markdownGroups(bundle: AgentRequestBundle, visibleChars: number): MarkdownGroup[] {
  const segments = visibleTranscriptSections(bundle, visibleChars);
  const groups: MarkdownGroup[] = [];
  let exchange: VisibleTranscriptSection[] = [];
  let fallbackTurn = 1;

  const flushExchange = () => {
    if (exchange.length === 0) return;
    const primary = exchange.find(({ section }) => section.role === 'user')?.section ?? exchange[0].section;
    const turn = exchangeTurn(primary, fallbackTurn);
    const latest = exchange.some(({ section }) => section.isDelta);
    groups.push({
      type: 'exchange',
      key: `exchange-${turn}-${groups.length}`,
      turn,
      tokens: exchange.reduce((sum, { section }) => sum + section.tokenCount, 0),
      latest,
      latestBodyVisible: exchange.some(({ section, visible }) => section.isDelta && hasVisibleBody(visible)),
      segments: exchange,
    });
    fallbackTurn += 1;
    exchange = [];
  };

  for (const segment of segments) {
    if (segment.section.role === 'system' || segment.section.role === 'context') {
      flushExchange();
      groups.push({
        type: 'preface',
        key: `preface-${segment.section.id}`,
        segments: [segment],
      });
      continue;
    }

    if (segment.section.role === 'user') {
      flushExchange();
      exchange = [segment];
      continue;
    }

    exchange.push(segment);
    if (segment.section.role === 'assistant') {
      flushExchange();
    }
  }

  flushExchange();
  return groups;
}

function StatelessMarkdownTranscript({
  bundle,
  currentTurn,
  visibleChars,
  typing,
}: {
  bundle: AgentRequestBundle;
  currentTurn: number;
  visibleChars: number;
  typing: boolean;
}) {
  const groups = markdownGroups(bundle, visibleChars);
  const lastGroupKey = groups[groups.length - 1]?.key;

  return (
    <div className="font-mono text-[12px] leading-[1.55]">
      {groups.map((group, index) => {
        const isLast = group.key === lastGroupKey;
        if (group.type === 'preface') {
          return (
            <div key={group.key} className="whitespace-pre-wrap break-words text-[#5f6a78]">
              {group.segments.map(({ section, prefix, visible }) => (
                <TranscriptSpan
                  key={section.id}
                  section={section}
                  prefix={prefix}
                  visible={visible}
                />
              ))}
              {isLast && typing ? <StreamingCursor /> : null}
            </div>
          );
        }

        return (
          <div key={group.key}>
            {index > 0 && (
              <div className="select-none py-2 font-mono text-[12px] tracking-[0.18em] text-[#8a96a5]">
                ---
              </div>
            )}
            <MarkdownExchangeGroup group={group} currentTurn={currentTurn} showCursor={isLast && typing} />
          </div>
        );
      })}
    </div>
  );
}

function MarkdownExchangeGroup({
  group,
  currentTurn,
  showCursor,
}: {
  group: Extract<MarkdownGroup, { type: 'exchange' }>;
  currentTurn: number;
  showCursor: boolean;
}) {
  const sentCount = Math.max(1, currentTurn - group.turn + 1);
  const wastedTokens = Math.max(0, sentCount - 1) * group.tokens;
  const isNewestGroup = group.latest && group.turn === currentTurn;
  const tooltip =
    wastedTokens > 0
      ? `This message pair was sent to the model ${sentCount} times. Only the first send was new; the other ${sentCount - 1} sends repeated about ${wastedTokens} tokens.`
      : 'This is the newest message group. It has only been sent once, so nothing has been re-sent yet.';
  const latestClass = group.latestBodyVisible
    ? 'border-l-4 border-[#00a3ff] bg-[#d9f1ff] text-[#102335]'
    : 'border-l-4 border-transparent';

  return (
    <div
      className={[
        'group/exchange relative -mx-2 rounded-xl px-2 py-2 pr-[6.75rem] transition-colors duration-200 hover:bg-[#d9f1ff]/70 xl:pr-2',
        latestClass,
      ].join(' ')}
    >
      <div className="whitespace-pre-wrap break-words">
        {group.segments.map(({ section, prefix, visible }) => (
          <TranscriptSpan
            key={section.id}
            section={section}
            prefix={prefix}
            visible={visible}
          />
        ))}
        {showCursor ? <StreamingCursor /> : null}
      </div>
      <div
        className="group/badge absolute right-2 top-2 rounded-full border border-[#00629d]/15 bg-white px-2 py-1 text-right font-mono text-[8px] uppercase tracking-[0.12em] text-[#00629d] shadow-[0_10px_22px_-20px_rgba(0,98,157,0.7)] transition-colors group-hover/exchange:bg-[#d9f1ff] xl:-right-[7.15rem] xl:border-white/70 xl:bg-white xl:text-[#00629d] xl:shadow-[0_18px_38px_-22px_rgba(0,0,0,0.95)] xl:group-hover/exchange:bg-[#d9f1ff]"
        aria-label={tooltip}
        tabIndex={0}
      >
        <div>{isNewestGroup ? 'new' : `sent ${sentCount}x`}</div>
        <div className="mt-0.5 text-[#6f7b89]">
          {wastedTokens > 0 ? `~${wastedTokens} tok` : '0 wasted'}
        </div>
        <div
          className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-[220px] rounded-xl border border-white/70 bg-white px-3 py-2 text-left font-sans text-[11px] normal-case leading-snug tracking-normal text-[#26313e] opacity-0 shadow-[0_18px_42px_-26px_rgba(0,0,0,0.9)] transition-opacity duration-150 group-hover/badge:opacity-100 group-focus/badge:opacity-100"
          role="tooltip"
        >
          {tooltip}
        </div>
      </div>
    </div>
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
  const isStateless = section.role !== 'context' && visible.startsWith('##');
  const isHuman = section.role === 'user';
  const isAssistant = section.role === 'assistant';
  const isSystem = section.role === 'system' || section.role === 'context';
  const isDelta = section.isDelta && section.role === 'user';
  const deltaHasBody =
    !isStateless &&
    isDelta &&
    visible.includes('\n\n') &&
    visible.split('\n\n').slice(1).join('\n\n').trim().length > 0;

  return (
    <>
      {prefix}
      <span
        className={[
          isStateless ? 'font-normal' : '',
          !isStateless && isHuman ? 'font-semibold' : '',
          !isStateless && isAssistant ? 'italic' : '',
          isSystem ? 'text-[#5f6a78]' : '',
          deltaHasBody ? 'relative -mx-2 block rounded-xl border-l-4 border-[#00a3ff] bg-[#d9f1ff] px-2 py-2 text-[#102335] shadow-[0_10px_24px_-22px_rgba(0,98,157,0.55)]' : '',
        ].join(' ')}
      >
        {visible}
      </span>
    </>
  );
}
