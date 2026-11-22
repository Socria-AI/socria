'use client';
// components/ux-v0/studio/DesignContext.tsx — what has been decided so far, and where each decision came from: the
// person's opening words, their own choice, or SocriaUX's judgement when it was left to it. Any of them can be opened
// again; nothing has to be said twice.

import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { decisionsOf, type DiscoveryEnv } from '@/lib/ux-v0/studio/discovery';
import { modeInfo } from '@/lib/ux-v0/studio/modes';
import { FileMark, ModeGlyph } from './glyphs';

const SOURCE: Record<string, string> = { words: 'From your words', person: 'Yours', socria: 'SocriaUX decides' };

export function DesignContext({ st, env, onChange, systemName, title = 'What we have so far', changeLabel = 'Change' }: { st: StudioState; env: DiscoveryEnv; onChange?: (id: string) => void; systemName?: string | null; title?: string; changeLabel?: string }) {
  const depth = st.depth ?? 1;
  const all = decisionsOf(st, env);
  const shown = all.filter((d) => d.source !== 'open' || d.depth <= depth);
  const open = all.length - shown.length;
  const m = modeInfo(st.mode);
  return (
    <div className="sd-ctx">
      <p className="sd-ctx-k">{title}</p>
      <p className="sd-ctx-mode">
        <ModeGlyph mode={st.mode} size={18} />
        <span>
          {m.label}
          {systemName ? <span className="sd-ctx-sys"> · in {systemName}</span> : null}
        </span>
      </p>
      <dl className="sd-ctx-list">
        {shown.map((d) => (
          <div key={d.id} className={`sd-ctx-row is-${d.source}`}>
            <dt>{d.topic}</dt>
            <dd>
              <span className="sd-ctx-v">{d.source === 'open' ? 'Still open' : d.summary || '—'}</span>
              {d.source !== 'open' && <span className="sd-ctx-src">{SOURCE[d.source] ?? ''}</span>}
              {onChange && d.source !== 'open' && (
                <button type="button" className="sd-textlink is-small" onClick={() => onChange(d.id)} aria-label={`${changeLabel}: ${d.topic}`}>
                  {changeLabel}
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {open > 0 && (
        <p className="sd-ctx-more">
          {open} finer choice{open === 1 ? '' : 's'} still on offer
        </p>
      )}
      {st.attachments.length > 0 && (
        <>
          <p className="sd-ctx-k is-sub">Brought in</p>
          <ul className="sd-ctx-files">
            {st.attachments.map((a) => (
              <li key={a.id}>
                {a.swatches?.length ? (
                  <span className="sd-file-sw" aria-hidden="true">
                    {a.swatches.slice(0, 4).map((c, i) => (
                      <span key={`${c}-${i}`} style={{ background: c }} />
                    ))}
                  </span>
                ) : (
                  <FileMark size={14} />
                )}
                <span>{a.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
