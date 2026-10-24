'use client';
// components/site/UseCase.tsx — one of the landing's three "what people
// bring" cells: a small Logos conversation that plays itself once it is on
// screen, and again on Replay.
//
// Each step appears at its own moment (`at`, in ms); a "Thinking…" row stays
// until `until` and then leaves. Before anything runs — on the server, with
// scripts off, or for someone who asked for reduced motion — the cell is its
// final state: every message and card in place, no thinking rows, nothing to
// replay. Only once the browser can run it is it set back to the start and
// armed to play when a third of it is in view.

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogosNode, type NodeStatus, type NodeType } from '@/components/ds';
import { Ico } from './icons';

export interface DemoCard {
  type: NodeType;
  label: string;
  status?: NodeStatus;
}

export type DemoStep =
  | { at: number; kind: 'you'; text: string }
  | { at: number; kind: 'socria'; text: string }
  | { at: number; until: number; kind: 'thinking' }
  | { at: number; kind: 'cards'; cards: DemoCard[] };

export interface UseCaseProps {
  /** the roman numeral in the corner */
  n: string;
  /** what it is, and where: "A problem set · Accounting 201" */
  kind: string;
  /** the first cell takes two parts of the row */
  wide?: boolean;
  /** how many cards the Logic Map tab counts once it has played */
  mapped: number;
  steps: DemoStep[];
  caption: string;
}

type Phase = 'final' | 'armed' | 'run';

// Not an inert attribute React 18 knows: the cards are a picture here, not
// controls to tab through.
const INERT = { inert: '' } as Record<string, string>;

export function UseCase({ n, kind, wide, mapped, steps, caption }: UseCaseProps) {
  const box = useRef<HTMLDivElement>(null);
  const timers = useRef<number[]>([]);
  const [phase, setPhase] = useState<Phase>('final');
  const [shown, setShown] = useState<ReadonlySet<number>>(() => new Set());
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set());

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const play = useCallback(() => {
    clear();
    setShown(new Set());
    setGone(new Set());
    setPhase('run');
    steps.forEach((s, i) => {
      timers.current.push(window.setTimeout(() => setShown((p) => new Set(p).add(i)), s.at));
      if (s.kind === 'thinking') {
        timers.current.push(window.setTimeout(() => setGone((p) => new Set(p).add(i)), s.until));
      }
    });
  }, [steps]);

  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const el = box.current;
    if (still || !el || typeof IntersectionObserver === 'undefined') return;
    setPhase('armed');
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          play();
        }
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clear();
    };
  }, [play]);

  const state = (i: number, s: DemoStep): string => {
    if (phase === 'final') return s.kind === 'thinking' ? ' is-gone' : '';
    if (gone.has(i)) return ' is-gone';
    if (!shown.has(i)) return ' is-armed';
    return s.kind === 'thinking' ? ' is-live' : '';
  };

  return (
    <div className={'s-use' + (wide ? ' is-wide' : '')}>
      <div className="s-use-head">
        <span className="s-use-n">{n}</span>
        <span className="s-use-k">{kind}</span>
      </div>
      <div className="s-demo" ref={box}>
        <div className="s-demo-tabs" aria-hidden="true">
          <span className="s-tab is-on">Chat</span>
          <span className="s-tab is-mid">Content</span>
          <span className="s-tab is-mid">Artifacts</span>
          <span className="s-tab">
            Logic Map<span className="s-count">{mapped}</span>
          </span>
        </div>
        {steps.map((s, i) => {
          const c = state(i, s);
          if (s.kind === 'you') return <p key={i} className={'s-step s-dq' + c}>{s.text}</p>;
          if (s.kind === 'socria') return <p key={i} className={'s-step s-da' + c}>{s.text}</p>;
          if (s.kind === 'thinking') {
            return (
              <div key={i} className={'s-step s-thinking' + c} aria-hidden="true">
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <span>Thinking…</span>
              </div>
            );
          }
          if (s.cards.length === 1) {
            const card = s.cards[0];
            return (
              <div key={i} className={'s-step is-scale s-dcard' + c} {...INERT}>
                <LogosNode type={card.type} label={card.label} status={card.status} />
              </div>
            );
          }
          return (
            <div key={i} className={'s-step is-scale s-dcards' + c} {...INERT}>
              {s.cards.map((card) => (
                <div key={card.label}>
                  <LogosNode type={card.type} label={card.label} status={card.status} />
                </div>
              ))}
            </div>
          );
        })}
        <div className="s-mini-omni" aria-hidden="true">
          <span className="s-omni-clip">
            <Ico name="clip" size={16} stroke={1.7} />
          </span>
          <span className="s-omni-ph">Ask, or point at something and ask</span>
          <span className="s-send">
            <Ico name="send" size={14} stroke={1.9} />
          </span>
        </div>
      </div>
      <p>{caption}</p>
      <button type="button" className="s-replay" onClick={play}>
        Replay <span aria-hidden="true">↻</span>
      </button>
    </div>
  );
}
