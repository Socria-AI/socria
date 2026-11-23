'use client';
// components/ux-v0/studio/Brief.tsx — what SocriaUX has understood so far, line by line, and where each line came from:
// the person's own words, an answer they gave, SocriaUX's own judgement where it was left to it, or a gap marked for
// the person to fill. Nothing here is a form: to change any of it, they say so in the conversation.

import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { briefLines, type DirectorEnv } from '@/lib/ux-v0/studio/director';
import { likedRefs } from '@/lib/ux-v0/studio/references';
import { FileMark } from './glyphs';

const SOURCE: Record<string, string> = { words: 'From your words', person: 'You said', socria: 'SocriaUX decides', gap: 'Yours to fill in' };

export function Brief({ st, env, title = 'What I have so far' }: { st: StudioState; env: DirectorEnv; title?: string }) {
  const lines = briefLines(st, env);
  const refs = likedRefs(st);
  return (
    <div className="sd-ctx">
      <p className="sd-ctx-k">{title}</p>
      <dl className="sd-ctx-list">
        {lines.map((l) => (
          <div key={l.label} className={`sd-ctx-row is-${l.source}`}>
            <dt>{l.label}</dt>
            <dd>
              <span className="sd-ctx-v">{l.value}</span>
              <span className="sd-ctx-src">{SOURCE[l.source]}</span>
            </dd>
          </div>
        ))}
      </dl>
      {refs.length > 0 && (
        <>
          <p className="sd-ctx-k is-sub">Websites it learns from</p>
          <ul className="sd-ctx-refs">
            {refs.map((r) => (
              <li key={r.id}>
                <span className="sd-ref-dots" aria-hidden="true">
                  {r.colours.slice(0, 4).map((c, i) => (
                    <span key={`${c}-${i}`} style={{ background: c }} />
                  ))}
                </span>
                <span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">
                    {r.host}
                  </a>
                  {r.take?.length ? ` — its ${r.take.map((t) => (t === 'colour' ? 'colours' : t)).join(' and ')}` : ''}
                </span>
              </li>
            ))}
          </ul>
          <p className="sd-ctx-more">Learnt from, never copied: nothing of a page is placed in your work.</p>
        </>
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
      <p className="sd-rail-note">To change any of it, say so — in your own words.</p>
    </div>
  );
}
