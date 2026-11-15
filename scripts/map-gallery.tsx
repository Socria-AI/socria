// scripts/map-gallery.tsx — THE UNIVERSAL MAP, DRAWN BY THE REAL COMPONENTS, WITH SYNTHETIC CONVERSATIONS.
//
// Bundled and opened in a real browser by scripts/verify-map.mjs, which takes screenshots at desktop and phone
// widths, in the light and dark themes, at every temporal scale, and measures how the map moves (frame times while
// panning and zooming, the time to switch a scale, search). Query: ?n=120&scale=week&narrow=1&theme=dark&seed=7.
// Nothing here is a person's: scripts/map-fixtures.mjs makes the conversations.

import { createRoot } from 'react-dom/client';
import { UniverseView } from '@/components/logos5/Universe';
import { emptyArrangement, setMode, type HomeMode } from '@/lib/logos5/arrange';
import type { ProjectIn, UniverseIn } from '@/lib/logos5/universe';
import { makeConversations, FIXTURE_PROJECTS } from './map-fixtures.mjs';
import '@/app/globals.css';
import '@/app/themes.css';
import '@/app/celestial.css';
import '@/components/logos5/l5.css';
import '@/components/logos5/l5-controls.css';
import '@/components/one/one-sheet.css';
import '@/components/logos5/redesign.css';
import '@/components/logos5/l5v.css';
import '@/components/logos5/revision2.css';

const q = new URLSearchParams(location.search);
const n = Number(q.get('n') ?? 60);
const scale = (q.get('scale') ?? 'week') as HomeMode;
const narrow = q.get('narrow') === '1';
const theme = q.get('theme') ?? 'light';
const seed = Number(q.get('seed') ?? 7);
const NOW = Date.UTC(2026, 10, 15, 15, 0, 0);
document.documentElement.setAttribute('data-theme', theme);

const projects = FIXTURE_PROJECTS as unknown as ProjectIn[];
const conversations = makeConversations(n, { now: NOW, seed, projects: projects as never[] }) as unknown as UniverseIn[];
const initial = setMode(emptyArrangement(), scale);
const noop = () => {};
(window as unknown as { __qa: unknown }).__qa = { n, scale, conversations: conversations.length };

function App() {
  return (
    <div className="logos-root" style={{ position: 'fixed', inset: 0 }}>
      <div className="l5 is-home rail-closed" style={{ height: '100%' }}>
        <div className="l5-main" style={{ height: '100%' }}>
          <div className="l5-body" style={{ height: '100%' }}>
            <UniverseView
              conversations={conversations}
              projects={projects}
              activeId={null}
              narrow={narrow}
              onOpen={(id) => ((window as unknown as { __opened: string }).__opened = id)}
              onOpenChat={(id) => ((window as unknown as { __opened: string }).__opened = id)}
              onStart={noop}
              onNew={noop}
              initial={initial}
              now={NOW}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
