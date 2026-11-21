'use client';

// components/ux-v0/graphics/LogoPanel.tsx — logos in the Graphics workspace: the concepts stage (every concept shown
// with its idea, rationale, construction, typography, geometry, scalability, weaknesses and measured quality; develop,
// set aside, compare, combine, explore further) and the editor's Logo tab (the concept on the artboard, its twelve
// quality criteria, the sizes from 16 to 512 px, the colour tests, the contexts, the lockups and versions, the nine
// commands and the explorations, lettering and symbol adjustments, approval, and the identity built from it). Nothing
// here calls a model: the logo engine runs in this browser (lib/ux-v0/graphics/logo).

import { useEffect, useMemo, useState } from 'react';
import type { Artboard, GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { CATEGORY_LABEL } from '@/lib/ux-v0/graphics/logo/brief';
import { COLOUR_SCHEMES, SCHEME_LABEL, logoDoc } from '@/lib/ux-v0/graphics/logo/build';
import type { LockupKind, LogoConcept } from '@/lib/ux-v0/graphics/logo/concepts';
import { CONTEXT_LABEL, contextDocs, schemeDoc, sizeDoc } from '@/lib/ux-v0/graphics/logo/contexts';
import { evaluateLogo, SIZES, type LogoEvaluation } from '@/lib/ux-v0/graphics/logo/evaluate';
import { LOGO_COMMANDS, LOGO_VARIATIONS, type LogoEditId } from '@/lib/ux-v0/graphics/logo/edits';
import { MODIFICATIONS } from '@/lib/ux-v0/graphics/logo/constants';
import { conceptsOf, selectedConcept } from '@/lib/ux-v0/graphics/logo/rebuild';
import { adjustLettering, adjustSymbol, approve, buildIdentity, combine, editedByHand, logoEdit, rejectConcept, setPresentation, putConcept, type SessionResult } from '@/lib/ux-v0/graphics/logo/session';
import { GRAPHIC_FONTS } from '@/lib/ux-v0/fonts';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';

const svgOf = (doc: GraphicDoc, measure: Measure, prefix: string, fixed?: number) => {
  const s = renderArtboard(doc, doc.artboards[0], { measure, idPrefix: prefix });
  return fixed ? s : s.replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"');
};

/** Concept evaluations, computed a few at a time so the page stays responsive. */
function useEvaluations(concepts: readonly LogoConcept[], brief: Parameters<typeof evaluateLogo>[1]): Record<string, LogoEvaluation> {
  const [done, setDone] = useState<Record<string, LogoEvaluation>>({});
  useEffect(() => {
    let alive = true;
    const todo = concepts.filter((c) => !done[c.id]);
    if (!todo.length) return;
    const step = (i: number) => {
      if (!alive || i >= todo.length) return;
      const e = evaluateLogo(todo[i], brief, concepts);
      setDone((d) => ({ ...d, [todo[i].id]: e }));
      setTimeout(() => step(i + 1), 0);
    };
    const t = setTimeout(() => step(0), 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts.map((c) => c.id).join('|')]);
  return done;
}

function ConceptCard({ c, e, svg, on, actions }: { c: LogoConcept; e?: LogoEvaluation; svg: string; on: boolean; actions: React.ReactNode }) {
  return (
    <li className={`gx-logo-card${c.status === 'rejected' ? ' is-aside' : ''}${on ? ' is-on' : ''}`} data-concept={c.id}>
      <div className="gx-logo-art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />
      <h3>
        {c.title}
        <span className="gx-badge">{CATEGORY_LABEL[c.category]}</span>
        {c.status === 'approved' ? <span className="gx-badge is-ok">Approved</span> : null}
      </h3>
      <p className="gx-logo-idea">{c.coreIdea}</p>
      <details className="gx-why">
        <summary>Rationale, construction and weaknesses</summary>
        <dl className="gx-logo-dl">
          <dt>Symbolic rationale</dt>
          <dd>{c.rationale}</dd>
          <dt>Construction</dt>
          <dd>{c.construction}</dd>
          <dt>Typography</dt>
          <dd>{c.typography}</dd>
          <dt>Geometry</dt>
          <dd>{c.geometry}</dd>
          <dt>Scalability</dt>
          <dd>{c.scalability || (e ? `Holds ${Math.round((e.sizes.find((s) => s.px === 32)?.survival ?? 0) * 100)}% at 32 px.` : '…')}</dd>
          <dt>Weaknesses</dt>
          <dd>{c.weaknesses.length ? c.weaknesses.join(' ') : 'None measured.'}</dd>
          {c.edit ? (
            <>
              <dt>Made by</dt>
              <dd>{c.edit}</dd>
            </>
          ) : null}
        </dl>
      </details>
      <p className="v0-quiet gx-logo-score">{e ? `Quality ${Math.round(e.score * 100)} / 100 · ${e.criteria.filter((x) => x.pass).length} of 12 criteria met` : 'Measuring…'}</p>
      <div className="gx-logo-acts">{actions}</div>
    </li>
  );
}

/** The concepts stage of a logo project (see the head of this file). */
export function LogoConceptsStage({ doc, measure, onDoc, onDevelop, onBack }: { doc: GraphicDoc; measure: Measure; onDoc: (next: GraphicDoc, label: string) => void; onDevelop: () => void; onBack: () => void }) {
  const board = doc.artboards.find((b) => b.logo) ?? null;
  const rec = board?.logo ?? null;
  const concepts = useMemo(() => (rec ? conceptsOf(rec) : []), [rec]);
  const evals = useEvaluations(concepts, rec?.brief ?? null);
  const [aside, setAside] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState('');
  const previews = useMemo(() => Object.fromEntries(concepts.map((c, i) => [c.id, svgOf(logoDoc(c, { width: 640, height: 400 }), measure, `lc${i}-`)])), [concepts, measure]);
  if (!board || !rec) return null;
  const run = (label: string, f: () => SessionResult) => {
    setBusy(`${label}…`);
    setTimeout(() => {
      const r = f();
      setBusy('');
      setSaid(r.said);
      if (r.doc !== doc) onDoc(r.doc, label);
    }, 0);
  };
  const shown = concepts.filter((c) => aside || c.status !== 'rejected');
  const cmp = concepts.filter((c) => compare.includes(c.id));
  return (
    <div className="gx-dirs gx-logo-stage">
      <header className="gx-brief-h">
        <p className="gx-kicker">A logo · 2 of 3</p>
        <h1>
          {concepts.length} concepts for “{rec.brief.name}”
        </h1>
        <p className="v0-quiet">Each is constructed for this brief (no library of logos, no clichés unless asked for). Develop one in the editor, set some aside, compare them, combine two, or explore further: every concept stays in the list.</p>
        <ul className="gx-logo-read">
          {rec.brief.said.slice(0, 5).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <div className="gx-concept-acts">
          {LOGO_VARIATIONS.map((v) => (
            <button key={v.id} type="button" className="sb-btn is-sm" disabled={!!busy} onClick={() => run(v.label, () => logoEdit(doc, board.id, v.id))}>
              {v.label}
            </button>
          ))}
          <label className="gx-check">
            <input type="checkbox" checked={aside} onChange={(e) => setAside(e.target.checked)} /> Show set-aside concepts
          </label>
        </div>
        {busy ? (
          <p className="gx-busy" role="status">
            {busy}
          </p>
        ) : said ? (
          <p className="gx-note is-ok" role="status">
            {said}
          </p>
        ) : null}
      </header>
      {cmp.length >= 2 && (
        <section className="gx-logo-compare" aria-label="Comparison">
          <h2>Comparing {cmp.length}</h2>
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                {cmp.map((c) => (
                  <th key={c.id}>{c.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(evals[cmp[0].id]?.criteria ?? []).map((k) => (
                <tr key={k.key}>
                  <td>{k.label}</td>
                  {cmp.map((c) => {
                    const x = evals[c.id]?.criteria.find((y) => y.key === k.key);
                    return (
                      <td key={c.id} className={x && !x.pass ? 'is-weak' : ''}>
                        {x ? Math.round(x.score * 100) : '…'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {cmp.length === 2 && (
            <button type="button" className="sb-btn is-sm" onClick={() => run('Combined', () => combine(doc, board.id, cmp[0].id, cmp[1].id))}>
              Combine: the symbol of “{cmp[0].title}” with the wordmark of “{cmp[1].title}”
            </button>
          )}
        </section>
      )}
      <ol className="gx-logo-grid">
        {shown.map((c) => (
          <ConceptCard
            key={c.id}
            c={c}
            e={evals[c.id]}
            svg={previews[c.id] ?? ''}
            on={rec.selected === c.id}
            actions={
              <>
                <button type="button" className="sb-btn is-primary is-sm" onClick={() => (onDoc(putConcept(doc, board.id, c.id).doc, `Developing “${c.title}”`), onDevelop())}>
                  Develop this concept
                </button>
                <label className="gx-check">
                  <input type="checkbox" checked={compare.includes(c.id)} onChange={(e) => setCompare((x) => (e.target.checked ? [...x, c.id].slice(-3) : x.filter((y) => y !== c.id)))} /> Compare
                </label>
                {c.status === 'rejected' ? (
                  <button type="button" className="sb-link is-meta" onClick={() => run('Restored', () => rejectConcept(doc, board.id, c.id, true))}>
                    Restore
                  </button>
                ) : rec.selected !== c.id ? (
                  <button type="button" className="sb-link is-meta" onClick={() => run('Set aside', () => rejectConcept(doc, board.id, c.id))}>
                    Set aside
                  </button>
                ) : null}
              </>
            }
          />
        ))}
      </ol>
      <p>
        <button type="button" className="sb-link" onClick={onBack}>
          Back to the brief
        </button>
      </p>
    </div>
  );
}

/** The editor's Logo tab for a logo artboard (see the head of this file). */
export function LogoTab({ doc, board, measure, onDoc, onMakeBoard }: { doc: GraphicDoc; board: Artboard; measure: Measure; onDoc: (next: GraphicDoc, label: string) => void; onMakeBoard?: (sys: MasterDesignSystem) => void }) {
  const rec = board.logo!;
  const concepts = useMemo(() => conceptsOf(rec), [rec]);
  const c = useMemo(() => selectedConcept(rec), [rec]);
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState('');
  const [e, setE] = useState<LogoEvaluation | null>(null);
  useEffect(() => {
    if (!c) return;
    setE(null);
    const t = setTimeout(() => setE(evaluateLogo(c, rec.brief, concepts)), 0);
    return () => clearTimeout(t);
  }, [c, rec.brief, concepts]);
  const sizes = useMemo(() => (c ? SIZES.map((px) => ({ px, svg: svgOf(sizeDoc(c, px), measure, `ls${px}-`, px <= 128 ? px : undefined) })) : []), [c, measure]);
  const schemes = useMemo(() => (c ? COLOUR_SCHEMES.map((s) => ({ s, svg: svgOf(schemeDoc(c, s), measure, `lsc${s}-`) })) : []), [c, measure]);
  const contexts = useMemo(() => (c ? contextDocs(c).map((x, i) => ({ ...x, svg: svgOf(x.doc, measure, `lcx${i}-`) })) : []), [c, measure]);
  const thumbs = useMemo(() => Object.fromEntries(concepts.map((x, i) => [x.id, svgOf(logoDoc(x, { width: 320, height: 200, pad: 24 }), measure, `lt${i}-`)])), [concepts, measure]);
  const hand = useMemo(() => editedByHand(board), [board]);
  if (!c) return <p className="v0-quiet">This logo’s record has no concept.</p>;
  const run = (label: string, f: () => SessionResult & { system?: MasterDesignSystem }) => {
    setBusy(`${label}…`);
    setTimeout(() => {
      const r = f();
      setBusy('');
      setSaid(r.said);
      if (r.doc !== doc) onDoc(r.doc, label);
      if (r.system && onMakeBoard && label === 'Board from the identity') onMakeBoard(r.system);
    }, 0);
  };
  const approved = rec.approved === c.id;
  const w = c.wordmark;
  return (
    <section className="gx-panel gx-logo" aria-label="Logo">
      <p className="gx-panel-h">Logo — {c.title}</p>
      <p className="gx-concept-idea">{c.coreIdea}</p>
      <p className="v0-quiet">
        {CATEGORY_LABEL[c.category]}
        {approved ? ' · approved' : ''}
        {hand ? ' · edited by hand (your drawn changes are kept; using a concept or a command redraws the logo, and undo brings them back)' : ''}
      </p>
      <details className="gx-why" open>
        <summary>The concept</summary>
        <dl className="gx-logo-dl">
          <dt>Rationale</dt>
          <dd>{c.rationale}</dd>
          <dt>Construction</dt>
          <dd>{c.construction}</dd>
          <dt>Typography</dt>
          <dd>{c.typography}</dd>
          <dt>Geometry</dt>
          <dd>{c.geometry}</dd>
          <dt>Weaknesses</dt>
          <dd>{c.weaknesses.join(' ') || 'None measured.'}</dd>
        </dl>
      </details>
      {busy ? (
        <p className="gx-busy" role="status">
          {busy}
        </p>
      ) : said ? (
        <p className="gx-note is-ok" role="status">
          {said}
        </p>
      ) : null}

      <p className="gx-panel-sub">Lockup and version</p>
      <div className="sb-seg gx-logo-seg" role="group" aria-label="Lockup">
        {(['horizontal', 'stacked', 'symbol', 'wordmark'] as LockupKind[]).map((k) => (
          <button key={k} type="button" className={`sb-seg-item${rec.lockup === k ? ' is-on' : ''}`} onClick={() => run(`The ${k} lockup`, () => setPresentation(doc, board.id, { lockup: k }))}>
            {k === 'stacked' ? 'vertical' : k}
          </button>
        ))}
      </div>
      <div className="sb-seg gx-logo-seg" role="group" aria-label="Colour version">
        {COLOUR_SCHEMES.map((s) => (
          <button key={s} type="button" className={`sb-seg-item${rec.scheme === s ? ' is-on' : ''}`} onClick={() => run(SCHEME_LABEL[s], () => setPresentation(doc, board.id, { scheme: s }))}>
            {SCHEME_LABEL[s]}
          </button>
        ))}
      </div>

      <p className="gx-panel-sub">Direct it</p>
      <div className="gx-concept-acts">
        {LOGO_COMMANDS.map((x) => (
          <button key={x.id} type="button" className="sb-btn is-sm" disabled={!!busy} onClick={() => run(x.label, () => logoEdit(doc, board.id, x.id as LogoEditId))}>
            {x.label.replace(/\.$/, '')}
          </button>
        ))}
      </div>
      <p className="gx-panel-sub">Explore</p>
      <div className="gx-concept-acts">
        {LOGO_VARIATIONS.map((x) => (
          <button key={x.id} type="button" className="sb-btn is-sm" disabled={!!busy} onClick={() => run(x.label, () => logoEdit(doc, board.id, x.id as LogoEditId))}>
            {x.label}
          </button>
        ))}
      </div>

      <p className="gx-panel-sub">Quality</p>
      {e ? (
        <>
          <p className="v0-quiet">
            {Math.round(e.score * 100)} / 100 · {e.criteria.filter((x) => x.pass).length} of 12 met
          </p>
          <ul className="gx-logo-criteria">
            {e.criteria.map((k) => (
              <li key={k.key} className={k.pass ? '' : 'is-weak'} title={k.notes.join(' · ')}>
                <span>{k.label}</span>
                <meter min={0} max={1} value={k.score} aria-label={`${k.label} ${Math.round(k.score * 100)}`} />
                <em>{k.notes[0]}</em>
              </li>
            ))}
          </ul>
          <p className="v0-quiet gx-logo-disclaimer">{e.disclaimer}</p>
        </>
      ) : (
        <p className="v0-quiet">Measuring…</p>
      )}

      <p className="gx-panel-sub">Sizes</p>
      <ul className="gx-logo-sizes" aria-label="The symbol at 16 to 512 px">
        {sizes.map((s) => (
          <li key={s.px}>
            <span className="gx-logo-size" style={s.px > 128 ? { width: 128, height: 128 } : undefined} dangerouslySetInnerHTML={{ __html: s.svg }} />
            <em>
              {s.px} px{s.px > 128 ? ' (shown at 128)' : ''}
              {e ? ` · ${Math.round((e.sizes.find((z) => z.px === s.px)?.survival ?? 1) * 100)}%` : ''}
            </em>
          </li>
        ))}
      </ul>

      <p className="gx-panel-sub">Colour tests</p>
      <ul className="gx-logo-tiles">
        {schemes.map((x) => {
          const t = e?.colours.find((y) => y.scheme === x.s);
          return (
            <li key={x.s} className={t && !t.pass ? 'is-weak' : ''}>
              <span dangerouslySetInnerHTML={{ __html: x.svg }} />
              <em>
                {SCHEME_LABEL[x.s]}
                {t ? ` · ${t.note}` : ''}
              </em>
            </li>
          );
        })}
      </ul>

      <p className="gx-panel-sub">In context</p>
      <ul className="gx-logo-tiles">
        {contexts.map((x) => {
          const t = e?.contexts.find((y) => y.context === x.context);
          return (
            <li key={x.context} className={t && !t.pass ? 'is-weak' : ''}>
              <span dangerouslySetInnerHTML={{ __html: x.svg }} />
              <em>
                {CONTEXT_LABEL[x.context]}
                {t ? ` · ${t.note}` : ''}
              </em>
            </li>
          );
        })}
      </ul>

      <p className="gx-panel-sub">Lettering</p>
      {w.kind === 'constructed' && w.style ? (
        <div className="gx-logo-controls">
          {(
            [
              ['weight', 'Weight', 0.05, 0.24, 0.01],
              ['width', 'Width', 0.75, 1.3, 0.01],
              ['tracking', 'Spacing', 0.6, 2.4, 0.05],
              ['slant', 'Slant', -12, 14, 1],
            ] as const
          ).map(([k, label, lo, hi, step]) => (
            <label key={k}>
              {label}
              <input
                type="range"
                min={lo}
                max={hi}
                step={step}
                defaultValue={w.style![k]}
                onMouseUp={(ev) => run('Lettering adjusted', () => adjustLettering(doc, board.id, { style: { [k]: Number((ev.target as HTMLInputElement).value) } }))}
                onKeyUp={(ev) => run('Lettering adjusted', () => adjustLettering(doc, board.id, { style: { [k]: Number((ev.target as HTMLInputElement).value) } }))}
              />
            </label>
          ))}
          <label>
            Modification
            <select value={w.modification?.kind ?? 'none'} onChange={(ev) => run('Lettering adjusted', () => adjustLettering(doc, board.id, { modification: modOf(ev.target.value, w.text.length) }))}>
              {MODIFICATIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="gx-logo-controls">
          <label>
            Face
            <select value={w.font} onChange={(ev) => run('Face changed', () => adjustLettering(doc, board.id, { font: ev.target.value }))}>
              {GRAPHIC_FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Spacing
            <input type="range" min={-60} max={400} step={10} defaultValue={w.tracking ?? 0} onMouseUp={(ev) => run('Spacing changed', () => adjustLettering(doc, board.id, { tracking: Number((ev.target as HTMLInputElement).value) }))} />
          </label>
          <label>
            Case
            <select value={w.case ?? 'none'} onChange={(ev) => run('Case changed', () => adjustLettering(doc, board.id, { case: ev.target.value as 'upper' | 'lower' | 'none' }))}>
              <option value="none">As written</option>
              <option value="upper">Capitals</option>
              <option value="lower">Small letters</option>
            </select>
          </label>
        </div>
      )}
      <p className="v0-quiet">Lettering is drawn from the name exactly as written (“{w.text}”); the faces offered are open-licence fonts served by Google Fonts.</p>

      {c.method ? (
        <>
          <p className="gx-panel-sub">Symbol</p>
          <div className="gx-logo-controls">
            <label>
              Stroke weight
              <input type="range" min={40} max={200} step={5} defaultValue={c.sw} onMouseUp={(ev) => run('Symbol adjusted', () => adjustSymbol(doc, board.id, { sw: Number((ev.target as HTMLInputElement).value) }))} />
            </label>
            <label>
              Softness
              <input type="range" min={0} max={1} step={0.05} defaultValue={c.soft} onMouseUp={(ev) => run('Symbol adjusted', () => adjustSymbol(doc, board.id, { soft: Number((ev.target as HTMLInputElement).value) }))} />
            </label>
          </div>
          <p className="v0-quiet">Every part of the symbol is an editable path: select it on the canvas to move its anchors and handles.</p>
        </>
      ) : null}

      <p className="gx-panel-sub">Identity</p>
      {approved ? (
        <div className="gx-concept-acts">
          <button type="button" className="sb-btn is-primary is-sm" onClick={() => run('Identity built', () => buildIdentity(doc, board.id))}>
            Build the identity
          </button>
          {onMakeBoard ? (
            <button type="button" className="sb-btn is-sm" onClick={() => run('Board from the identity', () => buildIdentity(doc, board.id))}>
              Make a board from it
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" className="sb-btn is-sm" onClick={() => run('Approved', () => approve(doc, board.id))}>
          Approve this logo
        </button>
      )}
      <p className="v0-quiet">The identity (palette, type, motif, pattern, icon style, imagery, guidelines and the variants) is built from the approved logo only.</p>

      <p className="gx-panel-sub">Concepts ({concepts.length})</p>
      <ul className="gx-logo-thumbs">
        {concepts.map((x) => (
          <li key={x.id} className={`${x.id === c.id ? 'is-on' : ''}${x.status === 'rejected' ? ' is-aside' : ''}`}>
            <span dangerouslySetInnerHTML={{ __html: thumbs[x.id] ?? '' }} />
            <em>
              {x.title}
              {x.status === 'approved' ? ' · approved' : x.status === 'rejected' ? ' · set aside' : ''}
            </em>
            {x.id !== c.id ? (
              <button type="button" className="sb-link is-meta" onClick={() => run(`“${x.title}”`, () => putConcept(doc, board.id, x.id))}>
                Use this
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function modOf(kind: string, n: number) {
  if (kind === 'cut') return { kind: 'cut' as const, at: Math.min(n - 1, 1), angle: 18 };
  if (kind === 'ligature') return { kind: 'ligature' as const, at: 0, height: 'base' as const };
  if (kind === 'lift') return { kind: 'lift' as const, at: Math.min(n - 1, 2) };
  if (kind === 'accent') return { kind: 'accent' as const, at: Math.min(n - 1, 1) };
  if (kind === 'swash') return { kind: 'swash' as const };
  if (kind === 'inline') return { kind: 'inline' as const };
  return { kind: 'none' as const };
}
