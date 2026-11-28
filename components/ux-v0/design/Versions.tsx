'use client';
// components/ux-v0/design/Versions.tsx — the history, which is never cut, and two versions side by side.
//
// Every change is a version and none is thrown away by making another: going back and changing something branches
// (lib/ux-v0/design/doc.ts). The history shows each version with its number (the number the designer is told, so
// "the type from version 3" means one thing), who made it, what it was made from when that is not the one before it,
// and whether it is kept (an approval). Any version can be opened, compared with what is shown, or kept.
//
// Comparing draws both versions of an artboard as they are — the artboards themselves, not pictures — and says what
// differs. One artboard can be brought back from the other version without touching anything else.

import { useMemo, useState } from 'react';
import { parentOf, type DesignArtboard, type DesignState } from '@/lib/ux-v0/design/doc';
import { compareVersions, type VersionDiff } from '@/lib/ux-v0/design/history';
import { frameDoc } from '@/lib/ux-v0/design/frame';
import { parseHtml } from './runtime';

const time = (at: number) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** An artboard drawn as it is, scaled to fit a box; it cannot be touched. */
export function ArtboardView({ a, tokens, assets, nonce, maxW, maxH }: { a: DesignArtboard; tokens: string; assets: ReadonlyMap<string, string>; nonce: string; maxW: number; maxH: number }) {
  const k = Math.min(maxW / a.width, maxH / a.height, 1);
  const page = useMemo(() => frameDoc(a, tokens, { parse: parseHtml, nonce, assets, interactive: false }), [a, tokens, nonce, assets]);
  return (
    <div className="dx-view" style={{ width: Math.round(a.width * k), height: Math.round(a.height * k) }}>
      <iframe title={a.name} sandbox="allow-scripts" srcDoc={page} tabIndex={-1} style={{ width: a.width, height: a.height, transform: `scale(${k})`, transformOrigin: '0 0' }} />
    </div>
  );
}

/** Where each version stands against the one shown: on the way to it, made from it, or on another branch. */
function standing(s: Pick<DesignState, 'versions' | 'at'>): ('shown' | 'before' | 'after' | 'aside')[] {
  const before = new Set<number>();
  for (let i = parentOf(s, s.at); i >= 0; i = parentOf(s, i)) before.add(i);
  return s.versions.map((_, i) => {
    if (i === s.at) return 'shown';
    if (before.has(i)) return 'before';
    for (let j = parentOf(s, i); j >= 0; j = parentOf(s, j)) if (j === s.at) return 'after';
    return 'aside';
  });
}

export function HistoryPanel({ s, onOpen, onCompare, onKeep }: { s: DesignState; onOpen: (i: number) => void; onCompare: (i: number) => void; onKeep: (i: number) => void }) {
  const where = useMemo(() => standing(s), [s]);
  return (
    <ol className="dx-history" aria-label="Versions">
      {[...s.versions]
        .map((v, i) => ({ v, i }))
        .reverse()
        .map(({ v, i }) => {
          const p = parentOf(s, i);
          return (
            <li key={i} className={`dx-ver is-${where[i]}`} data-version={i + 1}>
              <div className="dx-ver-head">
                <b>v{i + 1}</b>
                <span>
                  {v.by === 'model' ? 'Designer' : 'You'} · {time(v.at)}
                </span>
                {where[i] === 'shown' ? <em>shown</em> : null}
                {where[i] === 'aside' ? <em className="is-aside">another branch</em> : null}
              </div>
              <p>{v.said || 'A version'}</p>
              {v.kept ? <p className="dx-ver-kept">Kept — {v.kept}</p> : null}
              {p >= 0 && p !== i - 1 ? <p className="dx-ver-from">made from v{p + 1}</p> : null}
              <div className="dx-row">
                <button type="button" className="dx-btn dx-small" disabled={i === s.at} onClick={() => onOpen(i)}>
                  Open
                </button>
                <button type="button" className="dx-btn dx-ghost dx-small" disabled={i === s.at} onClick={() => onCompare(i)}>
                  Compare
                </button>
                {!v.kept ? (
                  <button type="button" className="dx-btn dx-ghost dx-small" onClick={() => onKeep(i)} title="Never trimmed from the history">
                    Keep
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
    </ol>
  );
}

const diffSaid = (d: VersionDiff, other: number): string => {
  if (d.change === 'same') return 'the same in both';
  if (d.change === 'added') return `not in v${other}`;
  if (d.change === 'removed') return `only in v${other}`;
  const e = d.elements;
  if (!e) return 'changed';
  const parts = [e.changed ? `${e.changed} changed` : '', e.added ? `${e.added} added` : '', e.removed ? `${e.removed} removed` : ''].filter(Boolean);
  return parts.length ? `${parts.join(', ')} (of ${e.changed + e.added + e.same} elements)` : 'its styles changed';
};

export function CompareModal({
  s,
  other,
  assets,
  nonce,
  selected,
  onOther,
  onOpen,
  onRestore,
  onClose,
}: {
  s: DesignState;
  /** the version compared with the one shown */
  other: number;
  assets: ReadonlyMap<string, string>;
  nonce: string;
  selected: string | null;
  onOther: (i: number) => void;
  onOpen: (i: number) => void;
  onRestore: (artboard: string) => void;
  onClose: () => void;
}) {
  const a = s.versions[other];
  const diff = useMemo(() => compareVersions(a.doc, s.doc), [a, s.doc]);
  const first = diff.artboards.find((d) => d.artboard === selected && d.change !== 'same') ?? diff.artboards.find((d) => d.change !== 'same') ?? diff.artboards[0];
  const [at, setAt] = useState<string | null>(first?.artboard ?? null);
  const cur = diff.artboards.find((d) => d.artboard === at) ?? first;
  const was = cur ? a.doc.artboards.find((x) => x.id === cur.artboard) ?? null : null;
  const now = cur ? s.doc.artboards.find((x) => x.id === cur.artboard) ?? null : null;
  const box = { w: typeof window !== 'undefined' ? Math.min(460, (window.innerWidth - 420) / 2) : 420, h: typeof window !== 'undefined' ? window.innerHeight - 320 : 480 };
  const canRestore = !!was && !!cur && cur.change !== 'same' && !now?.locked;
  return (
    <div className="dx-modal" role="dialog" aria-label="Compare versions" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dx-modal-box dx-compare">
        <div className="dx-compare-head">
          <h3 className="dx-h">Compare</h3>
          <label className="dx-field">
            <span>Version</span>
            <select value={other} onChange={(e) => onOther(Number(e.target.value))} aria-label="Version to compare">
              {s.versions.map((v, i) =>
                i === s.at ? null : (
                  <option key={i} value={i}>
                    v{i + 1} — {(v.said || 'A version').slice(0, 60)}
                  </option>
                )
              )}
            </select>
          </label>
          <span className="dx-muted">against what is shown (v{s.at + 1})</span>
        </div>
        {diff.tokensChanged ? <p className="dx-muted dx-small">The shared styles (colours and type every artboard uses) differ between these versions.</p> : null}
        <div className="dx-compare-body">
          <ul className="dx-compare-list">
            {diff.artboards.map((d) => (
              <li key={d.artboard}>
                <button type="button" className={d.artboard === cur?.artboard ? 'is-on' : ''} onClick={() => setAt(d.artboard)}>
                  <span>{d.name}</span>
                  <small className={`is-${d.change}`}>{diffSaid(d, other + 1)}</small>
                </button>
              </li>
            ))}
            {!diff.artboards.length ? <li className="dx-muted">No artboards in either version.</li> : null}
          </ul>
          <div className="dx-compare-pair">
            <figure data-side="other">
              <figcaption>
                v{other + 1}
                {a.kept ? ` · ${a.kept}` : ''}
              </figcaption>
              {was ? <ArtboardView a={was} tokens={a.doc.tokens} assets={assets} nonce={nonce} maxW={box.w} maxH={box.h} /> : <p className="dx-muted">Not in this version.</p>}
            </figure>
            <figure data-side="shown">
              <figcaption>v{s.at + 1} · shown</figcaption>
              {now ? <ArtboardView a={now} tokens={s.doc.tokens} assets={assets} nonce={nonce} maxW={box.w} maxH={box.h} /> : <p className="dx-muted">Not in this version.</p>}
            </figure>
          </div>
        </div>
        <div className="dx-row dx-end">
          <button type="button" className="dx-btn dx-ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="dx-btn" disabled={!canRestore} onClick={() => cur && onRestore(cur.artboard)} title={now?.locked ? 'The artboard shown is locked: reopen it first' : 'Only this artboard changes; it becomes a new version'}>
            Bring {was ? `“${was.name}”` : 'it'} back from v{other + 1}
          </button>
          <button type="button" className="dx-btn dx-primary" onClick={() => onOpen(other)}>
            Open v{other + 1}
          </button>
        </div>
      </div>
    </div>
  );
}
