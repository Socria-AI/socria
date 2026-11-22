'use client';
// components/ux-v0/studio/YourWork.tsx — everything made, in its own view (?work=1): the collection, searchable, each
// work opening where it was left. The home stays a single question; this is where the work is kept.

import type { ProjectSummary } from '@/lib/ux-v0/types';
import { Collection, type RemoteWork } from './Collection';
import { Plus } from './glyphs';

export function YourWork(p: { signedIn: boolean; ready: boolean; list: ProjectSummary[]; elsewhere: RemoteWork[]; nonce: string; onOpen: (id: string) => void; onDelete: (s: ProjectSummary) => void; onNew: () => void; onSystems: () => void }) {
  return (
    <div className="v0-home-page sb mu sd sd-home sd-work">
      <header className="sd-mast">
        <button type="button" className="sd-mark" onClick={p.onNew} aria-label="SocriaUX home">
          <img src="/socria-mark.png" alt="" width={20} height={20} />
          <span className="sd-wordmark">
            Socria<em>UX</em>
          </span>
        </button>
        <nav className="sd-mast-nav" aria-label="SocriaUX">
          <button type="button" className="sd-textlink" onClick={p.onSystems}>
            Design systems
          </button>
          {p.signedIn ? (
            <a className="sd-textlink" href="/account">
              Account
            </a>
          ) : (
            <a className="sd-textlink" href="/sign-in?redirect_url=/ux-v0">
              Sign in
            </a>
          )}
          <button type="button" className="sd-pill is-primary is-sm" onClick={p.onNew}>
            <Plus size={14} /> Make something new
          </button>
        </nav>
      </header>
      <main>
        <Collection signedIn={p.signedIn} ready={p.ready} list={p.list} elsewhere={p.elsewhere} nonce={p.nonce} onOpen={p.onOpen} onDelete={p.onDelete} onBegin={p.onNew} />
      </main>
    </div>
  );
}
