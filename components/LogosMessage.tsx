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

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LogosMsg } from '@/lib/logos-sessions';
import { mentionParts } from '@/lib/chat-thread';
import { copyText } from '@/lib/copy-text';
import { initialOf } from '@/lib/collab';
import { AttachmentList } from '@/components/LogosComposer';
import { MathText } from '@/components/TeX';
import { Inline, RichText } from '@/components/RichText';
import './logos-thread.css';

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
}: {
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
          {!!m.attachments?.length && <AttachmentList items={m.attachments} />}
          {m.content && (
            <div className="lg-msg-body">
              {m.role === 'assistant' ? (
                // Socria's prose carries the same small vocabulary
                // Core's does — a list, a numbered sequence, a bold
                // label, the one word in emphasis — and until this it
                // arrived as literal asterisks and hyphens. What the
                // person typed is never reinterpreted: their own
                // asterisks stay asterisks; only @socria is drawn as itself.
                <RichText text={m.content} math />
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
