'use client';

// components/ux-v0/CompositionExplorer.tsx — other compositions for one part, explored, compared, combined, approved.
//
// The part's own content (its title, points, figures, quote, words, pictures) is rearranged by the direction's
// compositional strategy (lib/ux-v0/composer.ts) in other spatial logics and with other treatments — alternatives that
// differ in STRUCTURE, never only in colour — each drawn by the real renderer, small. The designer can use one (a new
// version Undo takes back, and its composition is then held: later changes to the page leave its arrangement alone
// unless they ask), say "not this" (it is not proposed again for this project), pick two and combine them (where the
// first places things, with the second's treatments), or nudge the next round (more asymmetric, more overlap, calmer,
// bolder type, more or less shape). Nothing here asks a model: it is arithmetic over the part's own content.

import { useEffect, useMemo, useRef, useState } from 'react';
import { composeSignature, type Piece } from '@/lib/ux-v0/compose';
import { alternativesFor, blocksOf, blocksOfTree, combineAlternatives, NUDGES, NUDGE_LABEL, type Alternative, type Composition, type Nudge } from '@/lib/ux-v0/composer';
import { deriveForm, describeForm, type FormSystem } from '@/lib/ux-v0/form';
import { renderDesign } from '@/lib/ux-v0/render';
import { normalizeSpec, type DesignSpec, type Patch, type Section } from '@/lib/ux-v0/spec';
import { strategyFor, type CompositionStrategy } from '@/lib/ux-v0/strategy';
import type { MoodboardRef } from '@/lib/ux-v0/types';

/** A design made before shape systems existed: its system read from its look, with nothing said to move it. */
function formOfLook(spec: DesignSpec): FormSystem {
  return deriveForm({ radius: spec.tokens.radius, grid: spec.look.grid, containers: spec.look.containers, frame: spec.look.frame, shapes: spec.look.shapes, motifs: spec.look.motifs, seed: spec.title.length * 7919 + spec.sections.length }).form;
}

/** One alternative, drawn by the real renderer at a desktop width and scaled to its card. */
function AltFrame({ html, label }: { html: string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setScale(Math.max(0.1, e.contentRect.width / 1200)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="v0-alt-frame" ref={box}>
      <iframe title={label} sandbox="" srcDoc={html} tabIndex={-1} aria-hidden="true" style={{ width: 1200, height: 900, transform: `scale(${scale})` }} />
    </div>
  );
}

export function CompositionExplorer({
  spec,
  sec,
  refs,
  strategy,
  rejected,
  onPatch,
  onHold,
  onReject,
}: {
  spec: DesignSpec;
  sec: Section;
  refs: readonly MoodboardRef[];
  /** the approved direction's strategy (lib/ux-v0/strategy.ts); a design without one is given one from its look */
  strategy?: CompositionStrategy | null;
  /** arrangements the designer said no to, in this project */
  rejected: readonly string[];
  onPatch: (patch: Patch, label: string) => void;
  onHold: (sectionId: string, held: boolean) => void;
  onReject: (signature: string) => void;
}) {
  const [alts, setAlts] = useState<Alternative[] | null>(null);
  const [nudges, setNudges] = useState<Nudge[]>([]);
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  // another part, another exploration
  useEffect(() => {
    setAlts(null);
    setPicked([]);
    setNudges([]);
    setRound(0);
  }, [sec.id]);
  const form = useMemo(() => spec.look.form ?? formOfLook(spec), [spec]);
  const st = useMemo(() => strategy ?? strategyFor({ form, look: { grid: spec.look.grid, frame: spec.look.frame, motionFeel: spec.look.motion?.feel }, seed: form.seed }), [strategy, form, spec]);
  const opening = spec.sections.find((x) => x.kind !== 'nav')?.id === sec.id;
  const blocks = sec.kind === 'compose' ? blocksOfTree(sec.content.root as Piece, sec.images.length) : blocksOf(sec);
  if (!blocks) return null;
  const current = sec.kind === 'compose' ? composeSignature(sec.content.root as Piece) : '';
  const name = sec.kind === 'compose' ? 'part' : sec.kind;
  const sectionOf = (c: Pick<Composition, 'root' | 'span' | 'tall'>, held: boolean) => ({
    id: sec.id,
    kind: 'compose',
    variant: 'free',
    images: sec.images,
    ...(sec.tone ? { tone: sec.tone } : {}),
    ...(sec.pad ? { pad: sec.pad } : {}),
    ...(sec.responsive ? { responsive: sec.responsive } : {}),
    content: { root: c.root, ...(c.span ? { span: c.span } : {}), ...(c.tall ? { tall: c.tall } : {}) },
    ...(held ? { held: true } : {}),
  });
  const board = { refs: [...refs], queries: [], palettes: [], type: [] } as never;
  const preview = (c: Composition) => {
    const one = normalizeSpec({ ...spec, sections: [sectionOf(c, false)] }, board);
    return one ? renderDesign(one, refs).html : '';
  };
  const explore = (r: number, n: readonly Nudge[]) => {
    setRound(r);
    setPicked([]);
    setAlts(alternativesFor(blocks, { ...st, recompose: Math.max(1, st.recompose) }, form, { salt: sec.id, opening, count: 3, rejected, current, nudges: n, round: r, signatureOf: composeSignature }));
  };
  const use = (a: Composition) => onPatch({ op: 'replace', sectionId: sec.id, section: sectionOf(a, true), summary: `Composition: ${a.label}` }, `the ${name} composed ${a.label.split(' · ')[0]}, and its composition held`);
  const reject = (a: Alternative) => {
    onReject(composeSignature(a.root));
    setAlts((xs) => (xs ? xs.filter((x) => x.id !== a.id) : xs));
    setPicked((xs) => xs.filter((x) => x !== a.id));
  };
  const combine = () => {
    const [a, b] = picked.map((id) => alts?.find((x) => x.id === id)).filter((x): x is Alternative => !!x);
    if (!a || !b) return;
    const c = combineAlternatives(blocks, { ...st, recompose: Math.max(1, st.recompose) }, form, a, b, { salt: `${sec.id}|combined|${round}`, opening });
    setAlts((xs) => [{ ...c, id: `alt_combined_${Date.now().toString(36)}`, differs: [`where “${a.label.split(' · ')[0]}” places things, with ${b.label.split(' · ').slice(1).join(', ') || 'the other’s treatments'}`] }, ...(xs ?? [])].slice(0, 4));
    setPicked([]);
  };
  return (
    <section className="v0-explore" aria-label="Other compositions for this part">
      <div className="v0-edit-row">
        <span className="v0-edit-l">Composition</span>
        {sec.held ? (
          <>
            <span className="v0-quiet">Approved and held: words, pictures and its ground can change; its arrangement is asked about first.</span>
            <span className="v0-edit-foot">
              <button type="button" className="sb-link is-meta" onClick={() => onHold(sec.id, false)}>
                Release it
              </button>
            </span>
          </>
        ) : sec.kind === 'compose' ? (
          <span className="v0-edit-foot">
            <button type="button" className="sb-link is-meta" onClick={() => onHold(sec.id, true)}>
              Approve this composition
            </button>
          </span>
        ) : null}
        <span className="v0-quiet">Its own content, rearranged by the direction’s strategy ({describeForm(form).replace(/\.$/, '').toLowerCase()}). Each differs in structure, not colour.</span>
        <span className="v0-edit-foot">
          <button type="button" className="sb-link is-meta is-strong" onClick={() => explore(alts ? round + 1 : 0, nudges)}>
            {alts ? 'Explore again' : 'Explore compositions'}
          </button>
        </span>
      </div>
      {alts && (
        <>
          <div className="v0-edit-row" role="group" aria-label="Nudge the next round">
            <span className="v0-edit-l">Next round</span>
            <span className="v0-nudges">
              {NUDGES.map((n) => {
                const on = nudges.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    className={`v0-nudge${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? nudges.filter((x) => x !== n) : [...nudges.filter((x) => !(x === 'more-shape' && n === 'less-shape') && !(x === 'less-shape' && n === 'more-shape')), n];
                      setNudges(next);
                      explore(round + 1, next);
                    }}
                  >
                    {NUDGE_LABEL[n]}
                  </button>
                );
              })}
            </span>
          </div>
          {!alts.length && <p className="v0-quiet">Nothing new to propose with these nudges: every arrangement left has been tried or set aside. Change a nudge, or explore again.</p>}
          <ul className="v0-alts">
            {alts.map((a) => {
              const on = picked.includes(a.id);
              return (
                <li key={a.id} className={`v0-alt${on ? ' is-picked' : ''}`}>
                  <AltFrame html={preview(a)} label={a.label} />
                  <p className="v0-alt-label">{a.label}</p>
                  <ul className="v0-alt-diff">
                    {a.differs.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <div className="v0-alt-acts">
                    <button type="button" className="sb-link is-meta is-strong" onClick={() => use(a)}>
                      Use this
                    </button>
                    <button type="button" className="sb-link is-meta" onClick={() => reject(a)}>
                      Not this
                    </button>
                    <label className="v0-alt-pick">
                      <input type="checkbox" checked={on} onChange={() => setPicked((xs) => (on ? xs.filter((x) => x !== a.id) : [...xs, a.id].slice(-2)))} /> Combine
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
          {picked.length === 2 && (
            <div className="v0-edit-row">
              <button type="button" className="sb-link is-meta is-strong" onClick={combine}>
                Combine the two: the first’s arrangement with the second’s treatments
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
