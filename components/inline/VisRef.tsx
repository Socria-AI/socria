'use client';
// components/inline/VisRef.tsx — A REPLY'S WORDS THAT POINT AT THE PICTURE (Logos 6, November 2026).
//
// A reply writes [the demand curve](vis:highlight/curve:demand) (lib/visual/actions.ts). Here those words become a
// quiet control:
//   • in a reply just written, each marker is done once, in reading order, each given its moment before the next
//     (./visual-bus.ts cue) — and only when the part it names is drawn (it waits for the graph below it), never by
//     matching the reply's text, never again when the reply is drawn again, and not at all while it is still arriving
//     (the stream draws markers as words; the reply's final drawing does them);
//   • hovered or focused, the part it names is lit for a moment; pressed, the action is shown again;
//   • where it names nothing that exists, or there is no picture to point at, it is its words and nothing else.
// The part is found in the reply's own elements first, then in the newest picture on the page that has it.

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { parseVisHref, type VisualAction } from '@/lib/visual/actions';
import { act, actWhen, can, cue, onPage, useRegistry } from './visual-bus';

export interface VisReply {
  /** the reply's message id: its markers are done once, in order, under it */
  id: string;
  /** its own elements' keys, in order ("<id>:<n>") */
  keys: string[];
  /** just written: its markers are done as it is first read */
  fresh: boolean;
}

export const VisReplyContext = createContext<VisReply | null>(null);

/** Whether an action's parts exist on an artifact (not whether it would change anything now: a replay may not). */
function fits(key: string, a: VisualAction): boolean {
  if (a.targets.length) return can(key, { op: 'focus', targets: a.targets });
  return can(key, a);
}

/** The artifact a marker points into: the reply's own elements first, then the newest on the page that has the part. */
export function resolveMarker(reply: VisReply | null, a: VisualAction): string | null {
  for (const k of reply?.keys ?? []) if (fits(k, a)) return k;
  for (const { art } of onPage()) if (fits(art.key, a)) return art.key;
  return null;
}

export function VisRef({ words, href, children }: { words: string; href: string; children: ReactNode }) {
  const reply = useContext(VisReplyContext);
  const version = useRegistry();
  const action = useMemo(() => parseVisHref(href), [href]);
  const key = useMemo(() => (reply && action ? resolveMarker(reply, action) : null), [reply, action, version]);
  // a fresh reply: done once, in its turn, when what it names is drawn
  useEffect(() => {
    if (!reply?.fresh || !action) return;
    // the next marker waits for this one: a moment for emphasis, the motion's own length for a change
    cue(`${reply.id}|${href}|${words}`, (done) => actWhen((a) => resolveMarker(reply, a), { ...action }, 'socria', () => setTimeout(done, action.op === 'animate' || action.op === 'update_parameter' ? 1900 : 0)));
  }, [reply?.id, reply?.fresh, href]);
  if (!reply || !action || !key) return <>{children}</>;
  const showParts = () => {
    if (action.targets.length) act(key, { op: 'highlight', targets: action.targets }, 'socria');
  };
  const again = () => {
    // a change already made is shown again as a replay; anything else is done again
    if ((action.op === 'animate' || action.op === 'update_parameter') && !can(key, action)) act(key, { op: 'replay', targets: [] }, 'you');
    else act(key, { ...action, hold: action.op === 'highlight' || action.op === 'focus' ? false : action.hold }, 'you');
  };
  return (
    <button type="button" className="ln-vref" onPointerEnter={showParts} onFocus={showParts} onClick={again} title="Show it on the picture" aria-label={`${words}: show it on the picture`}>
      {children}
    </button>
  );
}
