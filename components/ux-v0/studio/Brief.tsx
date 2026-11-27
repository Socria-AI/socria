'use client';
// components/ux-v0/studio/Brief.tsx — what SocriaUX has understood so far, line by line, and where each line came from:
// the person's own words, an answer they gave, SocriaUX's own judgement where it was left to it, or a gap marked for
// the person to fill. Nothing here is a form: to change any of it, they say so in the conversation.

import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { briefLines, type BriefLine, type DirectorEnv } from '@/lib/ux-v0/studio/director';
import type { CreativeBrief } from '@/lib/ux-v0/studio/brief';
import { likedRefs } from '@/lib/ux-v0/studio/references';
import { FileMark } from './glyphs';

const SOURCE: Record<string, string> = { words: 'From your words', person: 'You said', socria: 'SocriaUX decides', gap: 'Yours to fill in' };
// for what discovery understood: SocriaUX's reading is a reading, and what is open is SocriaUX's to decide
const SOURCE_DISCOVERED: Record<string, string> = { words: 'From your words', person: 'You said', socria: 'My reading — say if it’s wrong', gap: 'I’ll decide unless you say' };

/** What discovery understood (lib/ux-v0/studio/brief.ts), line by line: the person's words, or SocriaUX's reading. */
function creativeLines(b: CreativeBrief): BriefLine[] {
  const out: BriefLine[] = [];
  const add = (label: string, value: string, source: BriefLine['source']) => value.trim() && out.push({ label, value: value.trim(), source });
  add('What it is', b.kind, 'words');
  add('What it is for', b.purpose, 'words');
  add('Who it is for', b.audience, 'words');
  add('Its words', b.content.replace(/\n/g, ' · '), 'person');
  add('How it should feel', b.feel, 'person');
  add('You asked for', b.explicit.slice(-4).join(' · '), 'person');
  add('Colours you picked', b.chosen.palette ? `${b.chosen.palette.name} — ${b.chosen.palette.colours.join(' ')}` : '', 'person');
  add('Lettering you picked', b.chosen.type ? `${b.chosen.type.name} — ${b.chosen.type.display}${b.chosen.type.body !== b.chosen.type.display ? ` with ${b.chosen.type.body}` : ''}` : '', 'person');
  add('Mood you picked', b.chosen.mood ? `${b.chosen.mood.name} — ${b.chosen.mood.note}` : '', 'person');
  add('Kept out', b.avoid.join(' · '), 'person');
  add('My reading', b.tentative.join(' · '), 'socria');
  add('Still open', b.open.join(' · '), 'gap');
  return out;
}

export function Brief({ st, env, title = 'What I have so far' }: { st: StudioState; env: DirectorEnv; title?: string }) {
  const lines = st.brief ? creativeLines(st.brief) : briefLines(st, env);
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
              <span className="sd-ctx-src">{(st.brief ? SOURCE_DISCOVERED : SOURCE)[l.source]}</span>
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
