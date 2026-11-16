// scripts/quiz-gallery.tsx — THE QUIZ, DRAWN BY THE REAL FIGURE, WORKED BY THE REAL OPERATIONS.
//
// Bundled and opened in a real browser by scripts/verify-quiz.mjs. The quiz is made in Node from the invented
// course's material (test/fixtures/quiz-material.mjs) by the same code the route runs — checked, shuffled, every
// key sealed — and handed to the page; the page applies what the student does as operations on the quiz display
// (lib/objects/display-quiz.ts) exactly as the conversation does, and the browser's grading requests are answered
// by the real grading code in Node. Query: ?theme=dark&narrow=1&both=1 (the Everything card and the expanded
// workspace side by side, one object).

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { apply, create, type ObjectSpace } from '@/lib/objects/core';
import '@/lib/objects';
import '@/components/display/register';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import type { WorkspaceAction } from '@/components/objects/figures';
import '@/app/globals.css';
import '@/app/themes.css';
import '@/components/display/display.css';

const q = new URLSearchParams(location.search);
document.documentElement.setAttribute('data-theme', q.get('theme') ?? 'light');
const W = window as unknown as { __quizInit: unknown; __actions: WorkspaceAction[]; __space: ObjectSpace };
W.__actions = [];

function App() {
  const [space, setSpace] = useState<ObjectSpace>(() => {
    const made = create({ objs: [] }, 'quiz', W.__quizInit, { origin: 'socria' });
    if (!made) throw new Error('the quiz could not be made');
    return made.space;
  });
  W.__space = space;
  const obj = space.objs[0];
  const props = {
    obj,
    at: obj.at,
    mode: 'live' as const,
    session: 'conv_qa',
    onOp: (op: string, args: Record<string, string | number>) => {
      const r = apply(W.__space, obj.id, op, args, { by: 'person' });
      if (r.ok) {
        W.__space = r.space;
        setSpace(r.space);
      }
      return r.ok ? { ok: true } : { ok: false, why: r.why };
    },
    onWorkspace: (a: WorkspaceAction) => {
      W.__actions.push(a);
      return { ok: true };
    },
  };
  const both = q.get('both') === '1';
  return (
    <div className="logos-root" style={{ position: 'fixed', inset: 0, background: 'var(--lg-paper, #f6f3ec)', padding: both ? 16 : 0, display: 'flex', gap: 16 }}>
      {both && (
        <div data-view="everything" style={{ width: 420, overflow: 'auto', border: '1px solid var(--lg-line)', borderRadius: 14, background: 'var(--lg-panel)' }}>
          <ObjectFigure {...props} />
        </div>
      )}
      {/* the expanded workspace scrolls, as Artifacts' panel does */}
      <div data-view="workspace" style={{ flex: 1, overflow: 'auto' }}>
        <ObjectFigure {...props} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
