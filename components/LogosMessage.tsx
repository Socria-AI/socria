'use client';
// components/LogosMessage.tsx
//
// ONE MESSAGE IN A LOGOS CONVERSATION — alone, or in a group.
//
// Alone it reads as it always has: Socria's words on the page, the person's in
// a bubble on the right. In a group it reads like a group chat: what you said
// on the right; everyone else on the left, each with their initial and name in
// their own colour; Socria on the left with its mark, saying whom it is
// answering. A run of messages from one person shows the name and face once.
//
// Every message can be copied, and anything not your own can be replied to —
// Socria's answers always, alone or not. A reply carries a quote of what it
// answers; pressing the quote goes to it.
//
// The actions sit in the flow under the message, never floating outside it:
// the conversation can be a narrow dock, and anything outside would be cut
// off. They are real buttons in reading order — reachable by Tab, shown on
// hover and focus, and always shown on a touch screen.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LogosMsg } from '@/lib/logos-sessions';
import { mentionParts } from '@/lib/chat-thread';
import { copyText } from '@/lib/copy-text';
import { initialOf } from '@/lib/collab';
import { AttachmentList } from '@/components/LogosComposer';
import { MathText } from '@/components/TeX';
import { Inline, RichText, type CiteRender } from '@/components/RichText';
import { citeVerdicts, type CiteVerdict } from '@/lib/docs/ground';
import type { DocRef } from '@/lib/docs/render';
import type { Ground } from '@/lib/docs/types';
import './logos-thread.css';

/** What a citation's chip says about the sentence it supports. */
const GROUND_SAY: Record<Ground, string> = {
  verbatim: 'The document says this.',
  derived: 'Calculated from the document’s numbers.',
  interpretation: 'A reading of the passage, in other words.',
  unsupported: 'The cited passage does not hold this.',
};
/**
 * The citations in one reply, each checked where it stands against the
 * passage it names (lib/docs/ground.ts citeVerdicts) — pure and
 * deterministic, so it is computed where it is drawn rather than stored with
 * the message.
 */
function useCites(text: string, refs: DocRef[] | undefined): ((key: string, before?: string) => CiteVerdict | null) | null {
  return useMemo(() => (refs?.length ? citeVerdicts(text, refs) : null), [text, refs]);
}

export type Side = 'mine' | 'other' | 'socria';

/** What a person typed, with each @socria drawn as a mention — never reinterpreted otherwise. */
export function SaidText({ text }: { text: string }) {
  const parts = mentionParts(text);
  if (parts.length === 1 && !parts[0].mention) return <MathText>{text}</MathText>;
  return (
    <>
      {parts.map((p, i) =>
        p.mention ? (
          <span key={i} className="lg-mention">
            @socria
          </span>
        ) : (
          <MathText key={i}>{p.text}</MathText>
        )
      )}
    </>
  );
}

function SocriaFace() {
  return (
    <span className="lg-msg-av is-socria" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/socria-mark.png" alt="" width={16} height={16} />
    </span>
  );
}

export function MsgActions({ m, who, canReply, onReply }: { m: LogosMsg; who: string; canReply: boolean; onReply?: (m: LogosMsg) => void }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const whose = who === 'You' ? 'your' : `${who}’s`;
  return (
    <div className="lg-msg-acts" role="group" aria-label={`Actions for ${whose} message`}>
      {canReply && onReply && (
        <button type="button" className="lg-msg-act" onClick={() => onReply(m)} aria-label={`Reply to ${whose} message`}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 6 6v4" />
          </svg>
          Reply
        </button>
      )}
      <button
        type="button"
        className="lg-msg-act"
        onClick={async () => {
          if (await copyText(m.content)) {
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1600);
          }
        }}
        aria-label={`Copy ${whose} message`}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copied ? (
            <path d="M5 12.5 10 17 19 7" />
          ) : (
            <>
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V6a2 2 0 0 1 2-2h9" />
            </>
          )}
        </svg>
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="lg-sr" role="status" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </div>
  );
}

export function LogosMessage({
  m,
  side,
  who,
  group,
  cont,
  hue,
  showQuote,
  canReply,
  onReply,
  onJump,
  toLabel,
  docRefs,
  onOpenCite,
  onOpenDoc,
}: {
  /** the conversation's documents, with their letters — a reply's citations are checked against them */
  docRefs?: DocRef[];
  /** open the passage a citation names */
  onOpenCite?: (docId: string, blockId: string) => void;
  /** open a document attached to this message */
  onOpenDoc?: (docId: string) => void;
  m: LogosMsg;
  side: Side;
  /** whom Socria is answering, as this screen says it ("You" for your own question) */
  toLabel?: string;
  /** as shown: "Socria", "You", or a person's name */
  who: string;
  /** a conversation more than one person is in */
  group: boolean;
  /** the same author as the message just before: no name or face again */
  cont: boolean;
  /** this person's colour */
  hue?: string;
  /** show what this message answers (Socria's answer right under its question needs no quote) */
  showQuote: boolean;
  canReply: boolean;
  onReply?: (m: LogosMsg) => void;
  onJump?: (id: string) => void;
}) {
  const style = hue ? ({ '--by': hue } as CSSProperties) : undefined;
  const to = group && side === 'socria' && m.replyTo?.role === 'user' ? toLabel ?? m.replyTo.who : null;
  const quote = showQuote ? m.replyTo : undefined;
  const cites = useCites(m.role === 'assistant' ? m.content : '', docRefs);
  const cite: CiteRender | undefined = useCallback<CiteRender>(
    (keys, _raw, before) => (
      <span className="lg-cites">
        {keys.map((k) => {
          const i = cites?.(k, before);
          const letter = k[0];
          // a document read on another device cannot be checked here — said, not called broken
          if (!docRefs?.some((r) => r.letter === letter)) {
            return (
              <span key={k} className="lg-cite is-away" title="This document’s reading is not on this device, so the citation cannot be checked or opened here.">
                {k}
              </span>
            );
          }
          const label = i?.ok ? `${letter} · p.${i.page}` : `${k}?`;
          const say = !i?.ok ? 'This citation names a passage the document does not have.' : i.ground ? `${GROUND_SAY[i.ground]}${i.why && i.ground !== 'verbatim' ? ` ${i.why}` : ''}` : 'Open the passage.';
          return (
            <button
              key={k}
              type="button"
              className={`lg-cite${i?.ok ? '' : ' is-broken'}${i?.ground ? ` is-${i.ground}` : ''}`}
              title={say}
              aria-label={`${i?.ok ? `Document ${letter}, page ${i.page}` : `Citation ${k}`} — ${say}`}
              disabled={!i?.ok || !onOpenCite}
              onClick={() => i?.ok && i.doc && i.block && onOpenCite?.(i.doc, i.block)}
            >
              {label}
              {i?.ground === 'unsupported' && <span aria-hidden="true"> ⚠</span>}
            </button>
          );
        })}
      </span>
    ),
    [cites, onOpenCite, docRefs]
  );
  return (
    <div
      id={m.id ? `lg-m-${m.id}` : undefined}
      className={`lg-msg lg-msg-${m.role} is-${side}${group ? ' is-group' : ''}${cont ? ' is-cont' : ''}`}
      style={style}
    >
      {group && side !== 'mine' && (side === 'socria' ? <SocriaFace /> : <span className="lg-msg-av" aria-hidden="true">{initialOf(who)}</span>)}
      <div className="lg-msg-main">
        {(group ? side !== 'mine' && !cont : side === 'socria') && (
          <span className="lg-msg-who">
            {who}
            {to && <span className="lg-msg-to"> → {to}</span>}
          </span>
        )}
        {quote && (
          <button
            type="button"
            className="lg-msg-quote"
            onClick={() => quote.id && onJump?.(quote.id)}
            disabled={!quote.id || !onJump}
            aria-label={`Replying to ${quote.who}: ${quote.excerpt}`}
          >
            <b>{quote.who}</b> <span>{quote.excerpt}</span>
          </button>
        )}
        <div className="lg-msg-stack">
          {!!m.attachments?.length && <AttachmentList items={m.attachments} onOpenDoc={onOpenDoc} />}
          {m.content && (
            <div className="lg-msg-body">
              {m.role === 'assistant' ? (
                // Socria's prose carries the same small vocabulary
                // Core's does — a list, a numbered sequence, a bold
                // label, the one word in emphasis — and until this it
                // arrived as literal asterisks and hyphens. What the
                // person typed is never reinterpreted: their own
                // asterisks stay asterisks; only @socria is drawn as itself.
                <RichText text={m.content} math cite={cites ? cite : undefined} />
              ) : (
                <SaidText text={m.content} />
              )}
            </div>
          )}
        </div>
        {m.content && <MsgActions m={m} who={who} canReply={canReply} onReply={onReply} />}
      </div>
    </div>
  );
}

/** Socria, still writing (or thinking) — drawn exactly as its message will be, so nothing jumps when it lands. */
export function SocriaPending({ text, group, to }: { text: string; group: boolean; to?: string | null }) {
  return (
    <div className={`lg-msg lg-msg-assistant is-socria${group ? ' is-group' : ''}`}>
      {group && <SocriaFace />}
      <div className="lg-msg-main">
        <span className="lg-msg-who">
          Socria
          {group && to && <span className="lg-msg-to"> → {to}</span>}
        </span>
        {text ? (
          // Inline marks only while the words are still arriving. Blocks
          // settle when the text stops: re-deciding "is this a list yet?" on
          // every token makes a half-written reply jump about under somebody
          // who is reading it.
          <div className="lg-msg-body is-streaming">
            <Inline text={text} math />
          </div>
        ) : (
          <div className="lg-thinking" aria-label="Thinking">
            <span /> <span /> <span />
          </div>
        )}
      </div>
    </div>
  );
}

/** Someone else here has asked Socria, and its answer is on its way to them. */
export function SocriaAnswering({ names }: { names: string[] }) {
  if (!names.length) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    <div className="lg-msg lg-msg-assistant is-socria is-group is-elsewhere" aria-live="polite">
      <SocriaFace />
      <div className="lg-msg-main">
        <span className="lg-msg-who">
          Socria <span className="lg-msg-to">→ {list}</span>
        </span>
        <div className="lg-thinking" aria-label={`Socria is answering ${list}`}>
          <span /> <span /> <span />
        </div>
      </div>
    </div>
  );
}
