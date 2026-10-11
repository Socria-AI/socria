'use client';

// components/display/experience-ui.tsx — what the five experiences draw alike.
//
//   BasisMark  where a thing came from, said plainly: yours, suggested by
//              Socria, Socria's reading, simulated, with a source — never
//              colour alone
//   Links      what this experience was started from and led to, resolved
//              LIVE from the workspace (a link is a reference, not a copy):
//              a thing since removed says so
//   useAsk     one request to the experience route, its answer applied as
//              Socria's through the workspace, its failure said out loud
//   Shared     a line saying everyone in a shared line of thinking sees this
//   Area       a longer text, committed when the person is done with it

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { currentOf, displayMeta, kindOf, type ThoughtObject } from '@/lib/objects';
import { BASIS_WORD, REL_WORD, type Basis, type Link } from '@/lib/objects/reasoning';
import type { FigureProps } from '@/components/objects/figures';

/** Where something came from, as a word — and a class, so it reads in every theme without leaning on colour. */
export function BasisMark({ by, basis, className = '' }: { by: 'person' | 'socria'; basis?: Basis; className?: string }) {
  const b: Basis = basis ?? (by === 'person' ? 'stated' : 'suggested');
  if (b === 'stated') return null;
  return <span className={`xp-basis is-${b} ${className}`}>{BASIS_WORD[b]}</span>;
}

const titleOf = (o: ThoughtObject) => {
  const t = (currentOf(o) as { title?: unknown } | undefined)?.title;
  return typeof t === 'string' && t ? t : o.name;
};

/** The connections, resolved against the workspace as it is now. */
export function Links({ links, p }: { links: readonly Link[]; p: FigureProps }) {
  if (!links.length) return null;
  return (
    <ul className="xp-links" aria-label="Connected to">
      {links.map((l, i) => {
        const o = p.space?.objs.find((x) => x.id === l.obj) ?? null;
        const noun = o ? (displayMeta(o.kind)?.noun ?? kindOf(o.kind)?.label ?? o.kind) : null;
        return (
          <li key={`${l.obj}-${l.part ?? ''}-${l.rel}-${i}`}>
            <span className="xp-links-rel">{REL_WORD[l.rel]}</span>{' '}
            {o ? (
              <>
                <span className="xp-links-noun">{noun}</span> {titleOf(o)}
                {p.onWorkspace && (
                  <button type="button" className="xp-link-open" onClick={() => p.onWorkspace?.({ type: 'open', obj: o.id })}>
                    Open
                  </button>
                )}
              </>
            ) : (
              <span className="xp-links-gone">something no longer in this workspace</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * One request to the experience route. What comes back is a list of
 * operations the kind already accepted from Socria; it is applied through
 * the workspace as Socria's, and the kind checks it again there.
 */
export function useAsk(p: FigureProps): { busy: string | null; said: string | null; run: (label: string, body: Record<string, unknown>) => Promise<boolean>; clear: () => void } {
  const [busy, setBusy] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  // the object as it is NOW — a reply asked for right after the person's line must carry that line
  const latest = useRef(p.obj);
  latest.current = p.obj;
  const run = async (label: string, body: Record<string, unknown>) => {
    if (!p.ask || !p.onWorkspace) {
      setSaid('Open it beside the conversation to ask Socria.');
      return false;
    }
    setBusy(label);
    setSaid(null);
    try {
      const r = await p.ask({ ...body, state: currentOf(latest.current) });
      if (!r.ok) {
        setSaid(r.why);
        return false;
      }
      const ops = Array.isArray(r.data.ops) ? (r.data.ops as { op: string; args: Record<string, string | number> }[]) : [];
      const done = p.onWorkspace({ type: 'socria', obj: latest.current.id, ops });
      if (!done.ok) setSaid(done.why ?? 'That could not be added.');
      else if (done.why) setSaid(`Some of it could not be added: ${done.why}`);
      return done.ok;
    } finally {
      setBusy(null);
    }
  };
  return { busy, said, run, clear: () => setSaid(null) };
}

/** A line that says, where it is true, that others see this. */
export function Shared({ shared, what = 'what you write here' }: { shared?: boolean; what?: string }) {
  if (!shared) return null;
  return <p className="xp-shared">This line of thinking is shared — everyone in it can see {what}.</p>;
}

/** A longer piece of writing, committed when the person leaves it or presses ⌘↵ — never on every keystroke. */
export function Area({
  value,
  onDone,
  label,
  placeholder,
  rows = 3,
  max = 400,
  disabled,
}: {
  value: string;
  onDone: (v: string) => void;
  label: string;
  placeholder?: string;
  rows?: number;
  max?: number;
  disabled?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      className="xp-area"
      value={v}
      rows={rows}
      maxLength={max}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v.trim() !== value.trim() && onDone(v.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
        if (e.key === 'Escape') setV(value);
      }}
    />
  );
}

/** A quiet section heading with an optional line of its own. */
export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="xp-section" aria-labelledby={id}>
      <h4 className="xp-h" id={id}>
        {title}
        {aside && <span className="xp-h-aside">{aside}</span>}
      </h4>
      {children}
    </section>
  );
}

/** What the route said, or that it is working — out loud, for everyone. */
export function AskStatus({ busy, said }: { busy: string | null; said: string | null }) {
  if (!busy && !said) return null;
  return (
    <p className={`xp-status${busy ? ' is-busy' : ''}`} role="status" aria-live="polite">
      {busy ? `${busy}…` : said}
    </p>
  );
}
