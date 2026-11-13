'use client';
// components/logos5/CourseSheet.tsx — HOW YOUR COURSE TEACHES AND TESTS, AND HOW SOCRIA KNOWS.
//
// The course profile (lib/teaching), inside Logos 5 rather than beside it: opened from the chatbox's chip when a
// course is in play, from "+" and from Artifacts. It shows
//
//   · whether this conversation is using the course, and why — and lets the person say otherwise;
//   · what the profile changes in Socria, from the same codes a turn uses (lib/teaching/use.ts effectsOf), and a
//     way to practise in the course's style — through the chatbox, never sent by itself;
//   · what Socria found, by how the course asks and how it teaches, each with its confidence, its basis (seen in
//     the materials, said by the syllabus, or Socria's reading of a pattern), how much supports it, and the
//     passages themselves — each opens in the file;
//   · the student's word on each: right, or not right (kept, marked, never used) — and taken back;
//   · the materials, what each was read as (theirs to change), past exams used only with their word that they may
//     be; and what changed as materials came in.
//
// It never says what an exam will ask.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BASIS_LABEL,
  CONFIDENCE_LABEL,
  DIMENSIONS,
  MATERIAL_KINDS,
  MATERIAL_LABEL,
  NEEDS_PERMISSION,
  NO_PREDICTION,
  SIDE_OF_DIMENSION,
  type CourseProfile,
  type Evidence,
  type MaterialKind,
  type Observation,
} from '@/lib/teaching/types';
import { profileLabel } from '@/lib/teaching/profile';
import { effectsOf, type CourseWhy } from '@/lib/teaching/use';
import { STUDY_ACCEPT } from '@/lib/logos5/study';
import './course.css';

type Tab = 'asks' | 'teaches' | 'concepts' | 'materials' | 'changes';
const TABS: [Tab, string][] = [
  ['asks', 'How it asks'],
  ['teaches', 'How it teaches'],
  ['concepts', 'What keeps coming up'],
  ['materials', 'Materials'],
  ['changes', 'What changed'],
];

const WHY_SAID: Record<CourseWhy, string> = {
  linked: 'you chose it for this conversation',
  materials: 'its materials are in this conversation',
  named: 'your message names the course',
  topic: 'what you are asking about is what this course keeps coming back to',
};

export interface CourseSheetProps {
  profiles: CourseProfile[];
  /** the profile shown */
  focus: string | null;
  /** the course in play in this conversation, and why */
  active: { id: string; why: CourseWhy } | null;
  /** this conversation's own choice: a profile, 'off', or nothing (Socria decides) */
  linked: string | null;
  /** files being read, by name */
  reading: string[];
  notice: string | null;
  narrow: boolean;
  /** there is a conversation to use a course in */
  inConversation: boolean;
  onClose: () => void;
  onFocus: (id: string) => void;
  onAdd: (files: File[], opts: { to: string | null; allowed: boolean }) => void;
  onKind: (profile: string, doc: string, kind: MaterialKind) => void;
  onAllow: (profile: string, doc: string, allowed: boolean) => void;
  onRemove: (profile: string, doc: string) => void;
  onCorrect: (profile: string, obs: string, verdict: 'wrong' | 'right', note?: string) => void;
  onRestore: (profile: string, obs: string) => void;
  onLink: (to: string | 'off' | null) => void;
  onPractice: (profile: CourseProfile) => void;
  onEvidence: (e: Evidence, name: string, file?: string) => void;
  onDelete: (profile: string) => void;
  /** drawn as an artifact, in the Artifacts view — no scrim, no dialog, no ×: it is one of the things made here */
  inline?: boolean;
}

const when = (t: number) => {
  try {
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

export function CourseSheet(p: CourseSheetProps) {
  const [tab, setTab] = useState<Tab>('asks');
  const [allowed, setAllowed] = useState(false);
  // the profile whose deletion is being asked about (the app's inline confirm — never the browser's dialog)
  const [deleting, setDeleting] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const profile = p.profiles.find((x) => x.id === p.focus) ?? p.profiles[0] ?? null;
  useEffect(() => {
    if (p.inline) return;
    closeRef.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        p.onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const names = useMemo(() => new Map((profile?.digests ?? []).map((d) => [d.material.doc, d.material])), [profile]);
  const effects = useMemo(() => (profile && profile.observations.length ? effectsOf(profile) : null), [profile]);
  const pick = () => fileRef.current?.click();
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = '';
    if (files.length) p.onAdd(files, { to: profile?.id ?? null, allowed });
  };

  const adder = (
    <div className="cs-add">
      <input ref={fileRef} type="file" multiple accept={STUDY_ACCEPT} hidden onChange={(e) => take(e.target.files)} />
      <button type="button" className="l5-btn is-primary" onClick={pick} disabled={p.reading.length > 0}>
        {p.reading.length ? `Reading ${p.reading.length === 1 ? p.reading[0] : `${p.reading.length} files`}…` : profile ? 'Add materials' : 'Add your course materials'}
      </button>
      <label className="cs-allow">
        <input type="checkbox" checked={allowed} onChange={(e) => setAllowed(e.target.checked)} />
        <span>Any past exams or quizzes among them are ones I am allowed to use</span>
      </label>
    </div>
  );

  const here = (() => {
    if (!profile || !p.inConversation) return null;
    const on = p.active?.id === profile.id;
    if (p.linked === 'off')
      return (
        <p className="cs-here">
          Courses are off in this conversation.{' '}
          <button type="button" className="l5-link" onClick={() => p.onLink(null)}>
            Turn them back on
          </button>
        </p>
      );
    if (on)
      return (
        <p className="cs-here is-on">
          <i aria-hidden="true" /> Socria is using this course in this conversation — {WHY_SAID[p.active!.why]}.{' '}
          {p.linked === profile.id ? (
            <button type="button" className="l5-link" onClick={() => p.onLink(null)}>
              Let Socria decide
            </button>
          ) : (
            <button type="button" className="l5-link" onClick={() => p.onLink(profile.id)}>
              Keep it on here
            </button>
          )}{' '}
          <button type="button" className="l5-link" onClick={() => p.onLink('off')}>
            Not in this conversation
          </button>
        </p>
      );
    return (
      <p className="cs-here">
        Not in use in this conversation.{' '}
        <button type="button" className="l5-link" onClick={() => p.onLink(profile.id)}>
          Use it here
        </button>
      </p>
    );
  })();

  const obsRow = (o: Observation) => <ObservationRow key={o.id} o={o} profile={profile!} names={names} {...p} />;
  const asks = profile ? profile.observations.filter((o) => SIDE_OF_DIMENSION[o.dimension] === 'assessment') : [];
  const teaches = profile ? profile.observations.filter((o) => SIDE_OF_DIMENSION[o.dimension] === 'teaching') : [];
  const waiting = profile ? profile.digests.filter((d) => NEEDS_PERMISSION.has(d.material.kind) && !d.material.allowed) : [];

  return (
    <div className={`cs-wrap${p.narrow ? ' is-narrow' : ''}${p.inline ? ' is-inline' : ''}`}>
      {!p.inline && <div className="cs-scrim" onClick={p.onClose} aria-hidden="true" />}
      <section className={`cs${p.inline ? ' is-inline' : ' l5-sheet'}`} {...(p.inline ? { 'aria-labelledby': 'cs-title' } : { role: 'dialog', 'aria-modal': true, 'aria-labelledby': 'cs-title' })}>
        <header className="cs-head">
          <div className="cs-bar">
            <span className="l5-label">Course profile</span>
            {!p.inline && (
              <button ref={closeRef} type="button" className="l5-icon cs-x" aria-label="Close the course profile" onClick={p.onClose}>
                ×
              </button>
            )}
          </div>
          {p.profiles.length > 1 && (
            <nav className="cs-courses" aria-label="Your courses">
              {p.profiles.map((x) => (
                <button key={x.id} type="button" className={`l5-tab${x.id === profile?.id ? ' is-on' : ''}`} aria-pressed={x.id === profile?.id} onClick={() => p.onFocus(x.id)}>
                  {profileLabel(x)}
                </button>
              ))}
            </nav>
          )}
          {profile ? (
            <>
              <h2 id="cs-title" className="cs-title">
                {profile.course}
                {profile.instructor && <span className="cs-who"> · {profile.instructor}</span>}
              </h2>
              <p className="cs-meta">
                {[profile.title, profile.term, `${profile.digests.length} material${profile.digests.length === 1 ? '' : 's'}`, `updated ${when(profile.updatedAt)}`].filter(Boolean).join(' · ')}
              </p>
            </>
          ) : (
            <h2 id="cs-title" className="cs-title">
              How your course teaches and tests
            </h2>
          )}
        </header>

        <div className="cs-scroll">
          {!profile && (
            <div className="cs-empty">
              <p>
                Add your syllabus, lecture slides or notes, study guides and assignments — and past quizzes and exams you are allowed to use. Socria reads how the course explains things and how it asks
                questions, shows you the evidence for each thing it notices, and uses it when you study this course: its terms, its kind of examples, practice with the same reasoning demands.
              </p>
              <p className="cs-fine">Kept in this browser, like the files themselves. {NO_PREDICTION}</p>
              {adder}
            </div>
          )}

          {profile && (
            <>
              {here}
              {p.notice && <p className="cs-notice" role="status">{p.notice}</p>}
              {waiting.length > 0 && (
                <div className="cs-wait" role="note">
                  <p>
                    {waiting.length === 1 ? `“${waiting[0].material.name}” is` : `${waiting.length} past exams or quizzes are`} not used yet: past exams and quizzes are only used with your word that you are
                    allowed to use them.
                  </p>
                  {waiting.map((d) => (
                    <button key={d.material.doc} type="button" className="l5-link" onClick={() => p.onAllow(profile.id, d.material.doc, true)}>
                      I am allowed to use “{d.material.name}”
                    </button>
                  ))}
                </div>
              )}
              {effects ? (
                <section className="cs-effects" aria-label="What this changes in Socria">
                  <div>
                    <h3 className="cs-h">When it explains</h3>
                    <ul>{effects.explain.map((l) => <li key={l}>{l}</li>)}</ul>
                  </div>
                  <div>
                    <h3 className="cs-h">When you practise</h3>
                    <ul>{effects.practice.map((l) => <li key={l}>{l}</li>)}</ul>
                  </div>
                  <div className="cs-go">
                    <button type="button" className="l5-btn is-primary" onClick={() => p.onPractice(profile)} disabled={!p.inConversation}>
                      Practise in this course’s style
                    </button>
                    <span className="cs-fine">{NO_PREDICTION}</span>
                  </div>
                </section>
              ) : (
                <p className="cs-fine">Nothing to read from these materials yet. Slides, notes or a past exam show the most.</p>
              )}

              <nav className="cs-tabs" role="tablist" aria-label="The profile">
                {TABS.map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={tab === id} className={`l5-tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
                    {label}
                    {id === 'asks' && asks.length ? <span className="cs-n">{asks.length}</span> : null}
                    {id === 'teaches' && teaches.length ? <span className="cs-n">{teaches.length}</span> : null}
                  </button>
                ))}
              </nav>

              <div className="cs-panel" role="tabpanel">
                {tab === 'asks' && (asks.length ? asks.map(obsRow) : <p className="cs-fine">Add a past exam, quiz or assignment (one you are allowed to use) to see how the course asks questions.</p>)}
                {tab === 'teaches' && (teaches.length ? teaches.map(obsRow) : <p className="cs-fine">Add lecture slides or notes to see how the course explains things.</p>)}
                {tab === 'concepts' &&
                  (profile.concepts.length ? (
                    <ol className="cs-concepts">
                      {profile.concepts.map((c) => (
                        <li key={c.term}>
                          <span className="cs-bar-w" style={{ ['--w' as string]: `${Math.round(c.weight * 100)}%` }} aria-hidden="true" />
                          <span className="cs-term">{c.term}</span>
                          <span className="cs-meta">
                            {[c.inAssessment ? `${c.inAssessment} past question${c.inAssessment === 1 ? '' : 's'}` : '', c.inTeaching ? `${c.inTeaching} in teaching` : ''].filter(Boolean).join(' · ')}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="cs-fine">Nothing comes up often enough yet to say.</p>
                  ))}
                {tab === 'materials' && (
                  <ul className="cs-materials">
                    {profile.digests.map((d) => {
                      const m = d.material;
                      const units = d.units.length;
                      const items = d.units.every((u) => u.kind === 'item');
                      return (
                        <li key={m.doc} className="l5-row cs-mat">
                          <div className="cs-mat-main">
                            <span className="cs-mat-name">{m.name}</span>
                            <span className="cs-meta">
                              {[units ? `${units} ${items ? (units === 1 ? 'question' : 'questions') : m.kind === 'slides' ? (units === 1 ? 'slide' : 'slides') : units === 1 ? 'section' : 'sections'}` : '', m.term, m.kindFrom === 'read' ? 'read from the file' : 'as you said']
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                          <label className="cs-kind">
                            <span className="cs-sr">What it is</span>
                            <select value={m.kind} onChange={(e) => p.onKind(profile.id, m.doc, e.target.value as MaterialKind)}>
                              {MATERIAL_KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {MATERIAL_LABEL[k]}
                                </option>
                              ))}
                            </select>
                          </label>
                          {NEEDS_PERMISSION.has(m.kind) && (
                            <label className="cs-allow is-row">
                              <input type="checkbox" checked={!!m.allowed} onChange={(e) => p.onAllow(profile.id, m.doc, e.target.checked)} />
                              <span>Allowed to use</span>
                            </label>
                          )}
                          <button type="button" className="l5-btn is-quiet is-sm" onClick={() => p.onRemove(profile.id, m.doc)} aria-label={`Remove ${m.name}`}>
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {tab === 'changes' && (
                  <ol className="cs-changes">
                    {profile.history.map((h, i) => (
                      <li key={`${h.at}-${i}`}>
                        <span className="cs-meta">{when(h.at)}</span> {h.said}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <footer className="cs-foot">
                {adder}
                {deleting === profile.id ? (
                  <div className="cs-confirm" role="group" aria-label={`Delete the profile for ${profileLabel(profile)}`}>
                    <p>Delete this profile? The files stay; what Socria read from them goes, and it cannot be brought back.</p>
                    <div className="cs-confirm-acts">
                      <button type="button" className="l5-btn is-sm is-danger is-solid" onClick={() => (setDeleting(null), p.onDelete(profile.id))}>
                        Delete it
                      </button>
                      <button type="button" className="l5-btn is-sm" autoFocus onClick={() => setDeleting(null)}>
                        Keep it
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="l5-btn is-quiet is-sm cs-del" onClick={() => setDeleting(profile.id)}>
                    Delete this profile
                  </button>
                )}
              </footer>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function ObservationRow({
  o,
  profile,
  names,
  onCorrect,
  onRestore,
  onEvidence,
}: { o: Observation; profile: CourseProfile; names: Map<string, { name: string; file?: string }> } & Pick<CourseSheetProps, 'onCorrect' | 'onRestore' | 'onEvidence'>) {
  const [open, setOpen] = useState(false);
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const c = profile.corrections[o.id];
  const support =
    o.basis === 'stated'
      ? 'from the syllabus'
      : `from ${o.support.units} ${o.dimension === 'formats' || SIDE_OF_DIMENSION[o.dimension] === 'assessment' ? (o.support.units === 1 ? 'question' : 'questions') : o.support.units === 1 ? 'place' : 'places'}${o.support.materials > 1 ? ` across ${o.support.materials} materials` : ' in one material'}`;
  return (
    <article className={`cs-obs${c?.verdict === 'wrong' ? ' is-wrong' : ''}`} aria-label={o.said}>
      <p className="cs-said">{o.said}</p>
      <p className="cs-tags">
        <span className={`cs-conf is-${o.confidence}`}>{CONFIDENCE_LABEL[o.confidence]}</span>
        <span className={`cs-basis is-${o.basis}`}>{BASIS_LABEL[o.basis]}</span>
        <span className="cs-meta">
          {DIMENSIONS[o.dimension]} · {support}
        </span>
      </p>
      {o.caveat && <p className="cs-caveat">{o.caveat}</p>}
      {c && (
        <p className="cs-yours">
          {c.verdict === 'wrong' ? 'You said this is not right: Socria does not use it.' : 'You confirmed this.'}
          {c.note ? ` “${c.note}”` : ''}{' '}
          <button type="button" className="l5-link" onClick={() => onRestore(profile.id, o.id)}>
            Undo
          </button>
        </p>
      )}
      <div className="cs-acts">
        <button type="button" className="l5-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide the evidence' : `See the evidence (${o.evidence.length})`}
        </button>
        {!c && (
          <>
            <button type="button" className="l5-link" onClick={() => onCorrect(profile.id, o.id, 'right')}>
              Right
            </button>
            <button type="button" className="l5-link" onClick={() => setNoting(true)}>
              Not right
            </button>
          </>
        )}
      </div>
      {noting && (
        <form
          className="cs-note"
          onSubmit={(e) => {
            e.preventDefault();
            onCorrect(profile.id, o.id, 'wrong', note);
            setNoting(false);
          }}
        >
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it really like? (optional)" maxLength={200} aria-label="What it is really like" />
          <button type="submit" className="l5-btn is-sm">
            Mark not right
          </button>
          <button type="button" className="l5-btn is-sm is-quiet" onClick={() => setNoting(false)}>
            Cancel
          </button>
        </form>
      )}
      {open && (
        <ul className="cs-ev">
          {o.evidence.map((e, i) => {
            const m = names.get(e.doc);
            return (
              <li key={`${e.doc}-${e.block}-${i}`}>
                <button type="button" className="cs-ev-b" onClick={() => onEvidence(e, m?.name ?? 'Material', m?.file)} title="Open it in the file">
                  <span className="cs-meta">
                    {m?.name ?? 'A material'} · {e.unit ? `${e.unit} · ` : ''}page {e.page}
                  </span>
                  <q>{e.quote}</q>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

/** The chatbox's chip: the course in play, said quietly; pressed, the profile opens. */
export function CourseChip({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button type="button" className="l5-btn is-sm is-quiet cs-chip" onClick={onOpen} title="This conversation is using your course profile — see what Socria knows about the course">
      <i aria-hidden="true" />
      {label}
    </button>
  );
}
