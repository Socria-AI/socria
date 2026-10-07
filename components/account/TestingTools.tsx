'use client';

// Manage Account → Testing. Never on production.
//
// What a tester needs to walk the product as somebody new, on their own
// account, without an incognito window (a protected preview will not let one
// in) or a second account: replay the first run, whole or in parts, and put
// back the things this browser remembers about how the product was arranged.
//
// Every action touches only what it names. Nothing here reaches anybody's
// conversations, maps, models or memory.

import { useEffect, useState } from 'react';
import { currentEnv, isProduction } from '@/lib/environment';
import { FIRST_RUN_KEY, readFirstRun, type Milestone } from '@/lib/first-run';
import { replayPart } from '@/components/useFirstRun';
import { HINTS_CHANGED } from '@/components/Hint';
import { CANVAS_PREFIX } from '@/lib/canvas-store';

/** What this browser remembers about how Logos 3 was arranged. */
const LAYOUT_KEYS = ['socria.logos3.workspace.v2', 'socria.logos3.dock.v1', 'socria.map.tabs.v1'];
const MODEL_KEYS = ['socria.model.v1', 'socria.model.chosen.v1', 'socria.model.lastCore.v1'];

function forget(keys: string[], prefix?: string): number {
  let n = 0;
  try {
    for (const k of keys) {
      if (window.localStorage.getItem(k) !== null) n++;
      window.localStorage.removeItem(k);
    }
    if (prefix) {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith(prefix)) {
          window.localStorage.removeItem(k);
          n++;
        }
      }
    }
  } catch {}
  return n;
}

export function TestingTools({ onClose }: { onClose: () => void }) {
  const [reached, setReached] = useState<Milestone[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    try {
      setReached(Object.keys(readFirstRun(window.localStorage).at) as Milestone[]);
    } catch {}
  }, [done]);

  if (isProduction()) return null;

  const ref = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF;
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  const where = [currentEnv() === 'development' ? 'local build' : currentEnv(), ref ? `branch ${ref}` : null, sha ? sha.slice(0, 7) : null]
    .filter(Boolean)
    .join(' · ');

  const run = async (id: string, act: () => Promise<void> | void, then?: () => void) => {
    setBusy(id);
    await act();
    setBusy(null);
    setDone(id);
    then?.();
  };
  const Item = ({ id, t, d, onClick }: { id: string; t: string; d: string; onClick: () => void }) => (
    <button type="button" className="act" disabled={busy !== null} onClick={onClick}>
      <span className="t">
        {t}
        {done === id && <span className="tt-done"> · done</span>}
      </span>
      <span className="d">{d}</span>
    </button>
  );

  return (
    <div className="sec tt">
      <span className="lbl">Testing</span>
      <p className="tt-where">Not on production · {where}</p>

      <p className="tt-sub">Onboarding</p>
      <div className="acts">
        <a className="act" href="/onboarding?replay=1">
          <span className="t">Replay onboarding</span>
          <span className="d">As a new person — name, what you think about, how you like to think, then the first thought</span>
        </a>
        <Item
          id="core"
          t="Replay Core’s first line"
          d="Shows again under the next reply in the chat"
          onClick={() => void run('core', () => replayPart('core'), () => window.location.assign('/chat'))}
        />
        <Item
          id="found"
          t="Replay the notes found along the way"
          d="Dependencies, Changed, Computed, Views, Evidence — each once again"
          onClick={() =>
            void run('found', () => replayPart('found'), () => {
              window.dispatchEvent(new Event(HINTS_CHANGED));
              onClose();
            })
          }
        />
      </div>
      <p className="tt-reached">
        <span>Reached on this browser:</span>{' '}
        {reached.length ? reached.join(' · ') : <em>nothing yet</em>}
      </p>

      <p className="tt-sub">Logos 3</p>
      <div className="acts">
        <Item
          id="layout"
          t="Reset the workspace layout"
          d="Panels, where the conversation is docked, where the lens tabs sit"
          onClick={() => void run('layout', () => void forget(LAYOUT_KEYS), () => window.location.reload())}
        />
        <Item
          id="canvas"
          t="Forget card positions and map views"
          d="Every placed card and remembered camera, on every map, on this browser"
          onClick={() => void run('canvas', () => void forget([], CANVAS_PREFIX), () => window.location.reload())}
        />
      </div>

      <p className="tt-sub">This browser</p>
      <div className="acts">
        <Item
          id="model"
          t="Forget the model choice"
          d="Opens on the automatic default, as somebody who never picked"
          onClick={() => void run('model', () => void forget(MODEL_KEYS), () => window.location.reload())}
        />
      </div>
      <p className="tt-note">
        Each touches only what it names — never your conversations, maps, models or memory. The first-run record lives at{' '}
        <code>{FIRST_RUN_KEY}</code> and on your account.
      </p>
    </div>
  );
}
