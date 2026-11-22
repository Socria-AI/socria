'use client';
// components/ux-v0/studio/Conversation.tsx — the creative director's conversation, one focused question at a time.
//
// The questions come from lib/ux-v0/studio/discovery.ts: only those that matter for this work, the accessible ones
// first, deeper ones offered once there is enough to begin. Each is answered with the control that suits it (visual
// cards drawn by the engines, chips, a ranking, colours, type in its own faces, sliders, fields, counts, files), in the
// person's own words, skipped, or left to SocriaUX. The conversation is on the left, the question on the right with
// what is taking shape under it; the decisions, each with where it came from, are in a drawer, and any of them can be
// opened again or changed in words. Nothing here calls a model: the conversation,
// the previews and the start are the engines' own, in this browser.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { StudioAnswer, StudioMode, StudioState } from '@/lib/ux-v0/studio/schema';
import { said } from '@/lib/ux-v0/studio/schema';
import { MODES, modeInfo } from '@/lib/ux-v0/studio/modes';
import { answerStage, currentStage, deeper, delegateStage, pathOf, readiness, readReply, reopen, reviseFromWords, skipStage, stepBack, summaryOf, surprise, type DiscoveryEnv, type Stage } from '@/lib/ux-v0/studio/discovery';
import { logoWordsOf, materialsOf, websiteAskOf, wordsOf } from '@/lib/ux-v0/studio/apply';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { StageControl, draftOf, draftReady, type Draft, type ResearchControls } from './controls';
import { SystemPicker } from './SystemPicker';
import { DesignContext } from './DesignContext';
import { Vision } from './Vision';
import { ArrowUp, Back, Check, Close, Down, Leave, ModeGlyph, Panel } from './glyphs';

export interface ConversationProps {
  studio: StudioState;
  onStudio: (fn: (s: StudioState) => StudioState) => void;
  env: DiscoveryEnv;
  websiteSystems: readonly MasterDesignSystem[];
  nonce: string;
  saveWords?: string;
  systems: readonly SystemRecord[];
  onSystem: (id: string | null) => void;
  onManageSystems: () => void;
  /** begin the work from this record (the latest, after any last change) */
  onStart: (st: StudioState) => void;
  /** what is happening while the work begins ('' when nothing is) */
  starting: string;
  error: string;
  onExit: () => void;
  onSwitchMode: (mode: StudioMode) => void;
  onFiles: (files: File[], stage: Stage) => Promise<{ ids: string[]; error?: string }>;
  onRemoveFile: (id: string) => void;
  /** references looked for on the internet, and what the person makes of them */
  research?: ResearchControls;
}

const START_LABEL: Record<StudioMode, string> = { graphic: 'Start creating', logo: 'Start creating', website: 'Start creating', board: 'Start creating', system: 'Bring it in', critique: 'Begin the critique' };

const list = (xs: readonly string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');
const given = (st: StudioState, id: string) => {
  const a = st.answers[id];
  return !!a && !a.skipped && !a.delegated && (a.values.length > 0 || !!a.text);
};

/** The references liked, as a clause of the plan. */
const liked = (st: StudioState) => {
  const n = (st.references ?? []).filter((r) => r.state === 'liked').length;
  return n ? `, guided by the ${n === 1 ? 'reference' : `${n} references`} you liked` : '';
};

/** What starting will do, said before it is done. */
function planLine(st: StudioState, env: DiscoveryEnv): string {
  const sum = (id: string) => summaryOf(st, id, env);
  switch (st.mode) {
    case 'graphic': {
      const w = wordsOf(st, 'g.words');
      return `I’ll compose “${w.headline}” three ways${liked(st)}${given(st, 'g.composition') ? `, ${sum('g.composition').toLowerCase()}` : ''}. You choose the one to develop, then change anything by hand or in words.`;
    }
    case 'logo': {
      const { name } = logoWordsOf(st);
      return `I’ll construct concepts for “${name}”${given(st, 'l.form') ? ` — ${sum('l.form').toLowerCase()}` : ''}${liked(st)}, each built from what it stands for, never taken from a library of marks.`;
    }
    case 'website': {
      const a = websiteAskOf(st);
      const fns = st.answers['w.functions']?.values ?? [];
      return `I’ll make “${a?.board.name ?? 'your site'}” as a working page${given(st, 'w.aesthetic') ? ` in ${sum('w.aesthetic')}` : ''}${fns.length ? `, with ${sum('w.functions').toLowerCase()}` : ''}. Then it is yours to shape, section by section.`;
    }
    case 'board': {
      const n = materialsOf(st).reduce((t, m) => t + m.count, 0);
      const w = wordsOf(st, 'b.words');
      return `I’ll plan ${n} material${n === 1 ? '' : 's'} around “${w.headline}” and propose the identity they share${liked(st)}. Each is its own composition.`;
    }
    case 'system':
      return `I’ll read ${sum('s.source').toLowerCase() || 'your files'} and show you what came across — references, modes and rules — before anything is kept.`;
    case 'critique':
      return `I’ll open your design to look at closely${given(st, 'c.focus') ? `, starting with ${sum('c.focus').toLowerCase()}` : ''}. Select any part and we reason it through; nothing is changed for you.`;
  }
}

// ── the question being asked ──

function StageCard({ stage, st, env, p, prior, onAnswer, onSkip, onDelegate, onBack, canBack, canStartNow, onStartNow, onSurprise }: { stage: Stage; st: StudioState; env: DiscoveryEnv; p: ConversationProps; prior?: StudioAnswer | null; onAnswer: (d: Draft) => void; onSkip: () => void; onDelegate: () => void; onBack: () => void; canBack: boolean; canStartNow: boolean; onStartNow: () => void; onSurprise: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(stage, st, prior));
  const [own, setOwn] = useState(() => !!draftOf(stage, st, prior).text);
  const ready = draftReady(stage, draft);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (own) textRef.current?.focus();
  }, [own]);
  const path = pathOf(st, env);
  const n = path.findIndex((s) => s.id === stage.id) + 1;
  return (
    <section className="sd-stage" aria-labelledby={`sd-q-${stage.id}`} data-stage={stage.id}>
      <p className="sd-stage-k">
        <span>{stage.topic}</span>
        {n > 0 && (
          <span className="sd-stage-n">
            {n} of {path.filter((s) => s.depth <= (st.depth ?? 1) || st.answers[s.id]).length || path.length}
          </span>
        )}
        {stage.required && <span className="sd-stage-req">Needed to begin</span>}
      </p>
      <h2 className="sd-q" id={`sd-q-${stage.id}`}>
        {stage.question}
      </h2>
      <p className="sd-why">{stage.why}</p>
      <div className="sd-control">
        <StageControl stage={stage} st={st} draft={draft} setDraft={setDraft} commit={onAnswer} nonce={p.nonce} websiteSystems={p.websiteSystems} attachments={st.attachments} onFiles={p.onFiles} onRemoveFile={p.onRemoveFile} research={p.research} />
      </div>
      {stage.allowText &&
        (own ? (
          <label className="sd-own-words">
            <span className="sd-field-l">{stage.textLabel}</span>
            <textarea
              ref={textRef}
              rows={2}
              value={draft.text ?? ''}
              placeholder="In your own words"
              onChange={(e) => setDraft({ ...draft, text: e.target.value.slice(0, 1200) })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && draftReady(stage, draft)) {
                  e.preventDefault();
                  onAnswer(draft);
                }
              }}
            />
          </label>
        ) : (
          <button type="button" className="sd-textlink sd-own-open" onClick={() => setOwn(true)}>
            Something else? {stage.textLabel}
          </button>
        ))}
      <div className="sd-acts">
        {canBack && (
          <button type="button" className="sd-pill is-ghost" onClick={onBack}>
            <Back size={15} /> Back
          </button>
        )}
        {!stage.required && (
          <button type="button" className="sd-pill is-ghost" onClick={onSkip}>
            Skip
          </button>
        )}
        {!stage.required && stage.allowDelegate && (
          <button type="button" className="sd-pill is-ghost" onClick={onDelegate} title="Leave this choice to SocriaUX">
            <Leave size={15} /> You decide
          </button>
        )}
        <span className="sd-acts-gap" />
        {canStartNow && (
          <button type="button" className="sd-pill is-ghost" onClick={onSurprise} title="Leave every remaining choice to SocriaUX, and begin">
            <Leave size={15} /> Surprise me
          </button>
        )}
        {canStartNow && (
          <button type="button" className="sd-pill is-quiet" onClick={onStartNow}>
            Start with this
          </button>
        )}
        <button type="button" className="sd-pill is-primary" disabled={!ready} onClick={() => onAnswer(draft)}>
          Continue
        </button>
      </div>
    </section>
  );
}

// ── the conversation ──

export function Conversation(p: ConversationProps) {
  const { studio: st, env } = p;
  const stage = currentStage(st, env);
  const ready = readiness(st, env);
  const path = pathOf(st, env);
  const depth = st.depth ?? 1;
  const [ctxOpen, setCtxOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [epoch, setEpoch] = useState(0);
  // an answer taken back (Back, or a decision opened again) is offered again as the starting point, to adjust
  const [priors, setPriors] = useState<Record<string, StudioAnswer>>({});
  const remember = (id: string | undefined) => {
    const a = id ? st.answers[id] : undefined;
    if (id && a && !a.skipped && !a.delegated) setPriors((x) => ({ ...x, [id]: a }));
  };
  const scroller = useRef<HTMLDivElement>(null);
  const stagePane = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const modeBox = useRef<HTMLDivElement>(null);
  const info = modeInfo(st.mode);
  const answeredByPerson = Object.values(st.answers).some((a) => a.source !== 'words');
  const systemName = env.hasSystem ? env.systemName ?? null : null;

  // the newest turn in view, gently (at once for those who asked for less motion), within the conversation's own column
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: box.scrollHeight, behavior: calm ? 'auto' : 'smooth' });
  }, [st.transcript.length]);
  // each new question is read from its top (on a narrow screen, where everything is one column, it is brought into view)
  useEffect(() => {
    const el = stagePane.current;
    if (!el) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 960px)').matches) el.scrollIntoView({ block: 'start' });
    else el.scrollTo({ top: 0 });
  }, [stage?.id, epoch, p.starting]);

  useEffect(() => {
    if (!ctxOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setCtxOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [ctxOpen]);

  useEffect(() => {
    if (!modeOpen) return;
    const away = (e: PointerEvent) => !modeBox.current?.contains(e.target as Node) && setModeOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setModeOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [modeOpen]);

  const change = (next: StudioState) => {
    p.onStudio(() => next);
    setEpoch((e) => e + 1);
  };
  const answer = (d: Draft) => stage && change(answerStage(st, stage.id, d, env));
  const back = () => {
    const next = stepBack(st);
    if (next === st) return;
    const gone = Object.keys(st.answers).find((k) => !next.answers[k]);
    remember(gone);
    const topic = gone ? path.find((s) => s.id === gone)?.topic : '';
    change(said(next, { from: 'socria', kind: 'change', text: topic ? `Back to ${topic.toLowerCase()}.` : 'One step back.' }));
  };
  const begin = (from: StudioState) => {
    if (!readiness(from, env).canStart) return;
    p.onStart(from);
  };
  const surpriseMe = () => {
    const next = surprise(st, env);
    change(next);
    if (readiness(next, env).canStart) begin(next);
  };
  const reopenIt = (id: string) => {
    remember(id);
    change(said(reopen(st, id), { from: 'socria', kind: 'change', text: `Open again: ${path.find((s) => s.id === id)?.topic.toLowerCase() ?? 'that decision'}.` }));
    setCtxOpen(false);
  };

  const send = () => {
    const text = reply.trim();
    if (!text) return;
    setReply('');
    const r = readReply(st, text, env);
    const withLine = (x: StudioState) => said(x, { from: 'person', kind: 'reply', text });
    switch (r.kind) {
      case 'start':
        if (ready.canStart) return begin(withLine(st));
        return change(said(withLine(st), { from: 'socria', kind: 'note', text: `Before I begin I need ${list(ready.missing.map((m) => m.toLowerCase()))}.` }));
      case 'surprise':
        return surpriseMe();
      case 'back': {
        const next = stepBack(st);
        return change(said(withLine(next), { from: 'socria', kind: 'change', text: 'One step back.' }));
      }
      case 'skip':
        if (!stage) return change(withLine(st));
        if (stage.required) return change(said(withLine(st), { from: 'socria', kind: 'note', text: `This one I need to begin: ${stage.why}` }));
        return change(skipStage(st, stage.id, env));
      case 'deeper':
        return change(said(withLine(deeper(st)), { from: 'socria', kind: 'note', text: 'More choices, then: the finer points are open below.' }));
      case 'switch':
        return p.onSwitchMode(r.mode);
      case 'answer':
        return change(answerStage(st, r.stage, r.answer, env));
      case 'words':
        return change(reviseFromWords(st, r.text).st);
    }
  };

  const shownPath = path.filter((s) => s.depth <= depth || st.answers[s.id]);
  const moreCount = path.length - shownPath.length;
  const done = (id: string) => {
    const a = st.answers[id];
    return !!a;
  };

  return (
    <div className="v0 sb sd sd-conv">
      <header className="sd-head">
        <div className="sd-head-l">
          <button type="button" className="sd-mark" onClick={p.onExit} aria-label="SocriaUX home">
            <img src="/socria-mark.png" alt="" width={18} height={18} />
            <span className="sd-wordmark">
              Socria<em>UX</em>
            </span>
          </button>
          <div className="sd-mode" ref={modeBox}>
            <button type="button" className="sd-pill sd-mode-btn" aria-expanded={modeOpen} aria-haspopup="true" onClick={() => setModeOpen((o) => !o)}>
              <ModeGlyph mode={st.mode} size={16} />
              <span>{info.label}</span>
              <Down size={13} />
            </button>
            {modeOpen && (
              <div className="sd-pop is-modes" role="group" aria-label="What we are making">
                <p className="sd-pop-k">What we are making</p>
                {MODES.map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    className={`sd-pop-item${m.mode === st.mode ? ' is-on' : ''}`}
                    aria-pressed={m.mode === st.mode}
                    onClick={() => {
                      setModeOpen(false);
                      if (m.mode !== st.mode) p.onSwitchMode(m.mode);
                    }}
                  >
                    <ModeGlyph mode={m.mode} size={18} />
                    <span className="sd-pop-t">{m.label}</span>
                    <span className="sd-pop-h">{m.line}</span>
                    {m.mode === st.mode && <Check size={15} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <nav className="sd-path" aria-label="The questions">
          {shownPath.map((s) => {
            const isNow = stage?.id === s.id;
            const isDone = done(s.id) && !isNow;
            return (
              <button key={s.id} type="button" className={`sd-step${isNow ? ' is-now' : ''}${isDone ? ' is-done' : ''}`} aria-current={isNow ? 'step' : undefined} disabled={!isDone} onClick={() => reopenIt(s.id)} title={isDone ? `${s.topic}: ${summaryOf(st, s.id, env)} — open again` : s.topic}>
                <span className="sd-step-dot" aria-hidden="true" />
                <span className="sd-step-t">{s.topic}</span>
              </button>
            );
          })}
          {moreCount > 0 && <span className="sd-step is-more">+{moreCount}</span>}
        </nav>
        <div className="sd-head-r">
          {st.mode !== 'critique' && st.mode !== 'system' && <SystemPicker systems={p.systems} value={st.systemId ?? null} onChange={p.onSystem} onManage={p.onManageSystems} label={false} align="end" />}
          {p.saveWords && (
            <span className="sd-save" role="status">
              {p.saveWords}
            </span>
          )}
          <button type="button" className="sd-pill is-ghost sd-ctx-toggle" aria-expanded={ctxOpen} aria-controls="sd-decisions" onClick={() => setCtxOpen((o) => !o)}>
            <Panel size={15} /> Decisions
          </button>
          <button type="button" className="sd-icon" onClick={p.onExit} aria-label="Leave the conversation (it is kept)">
            <Close size={17} />
          </button>
        </div>
      </header>

      <div className="sd-body">
        <div className="sd-talk" ref={scroller}>
        <ol className="sd-transcript" aria-label="The conversation">
          {st.transcript.map((m) => {
            const reopenable = m.from === 'person' && m.kind === 'answer' && m.stage && st.answers[m.stage] && path.some((s) => s.id === m.stage);
            return (
              <li key={m.id} className={`sd-msg is-${m.from} k-${m.kind}`}>
                {m.from === 'person' ? (
                  <div className="sd-bubble">
                    <p>{m.text}</p>
                    {m.attachments?.length ? (
                      <p className="sd-bubble-files">
                        {m.attachments
                          .map((id) => st.attachments.find((a) => a.id === id)?.name)
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null}
                    {reopenable && (
                      <button type="button" className="sd-textlink is-small" onClick={() => reopenIt(m.stage!)}>
                        Change
                      </button>
                    )}
                  </div>
                ) : (
                  <p className={m.kind === 'question' ? 'sd-said-q' : 'sd-said'}>{m.text}</p>
                )}
              </li>
            );
          })}
        </ol>
          <div ref={endRef} className="sd-end" />
        </div>

        <div className="sd-stagepane" ref={stagePane}>
          <div className="sd-stage-col">
            {p.starting ? (
              <section className="sd-starting" role="status" aria-live="polite">
                <span className="sd-starting-bar" aria-hidden="true" />
                <p className="sd-said">{p.starting}</p>
              </section>
            ) : stage ? (
              <StageCard
                key={`${stage.id}|${epoch}`}
                stage={stage}
                st={st}
                env={env}
                p={p}
                prior={priors[stage.id] ?? null}
                onAnswer={answer}
                onSkip={() => change(skipStage(st, stage.id, env))}
                onDelegate={() => change(delegateStage(st, stage.id, env))}
                onBack={back}
                canBack={answeredByPerson}
                canStartNow={ready.canStart && !stage.required}
                onStartNow={() => begin(st)}
                onSurprise={surpriseMe}
              />
            ) : (
              <section className="sd-stage is-enough" aria-labelledby="sd-enough-t">
                <p className="sd-stage-k">
                  <span>Ready</span>
                </p>
                <h2 className="sd-q" id="sd-enough-t">
                  {ready.canStart ? (
                    <>
                      I have enough to <em>begin</em>.
                    </>
                  ) : (
                    <>One thing before I begin.</>
                  )}
                </h2>
                <p className="sd-why">{ready.canStart ? planLine(st, env) : `Still needed: ${list(ready.missing)}.`}</p>
                <div className="sd-acts">
                  {answeredByPerson && (
                    <button type="button" className="sd-pill is-ghost" onClick={back}>
                      <Back size={15} /> Back
                    </button>
                  )}
                  <span className="sd-acts-gap" />
                  {ready.more > 0 && (
                    <button type="button" className="sd-pill is-quiet" onClick={() => change(deeper(st))}>
                      Keep refining · {ready.more} more
                    </button>
                  )}
                  {ready.more > 0 && (
                    <button type="button" className="sd-pill is-ghost" onClick={surpriseMe} title="Leave every remaining choice to SocriaUX, and begin">
                      <Leave size={15} /> Surprise me
                    </button>
                  )}
                  <button type="button" className="sd-pill is-primary" disabled={!ready.canStart} onClick={() => begin(st)}>
                    {START_LABEL[st.mode]}
                  </button>
                </div>
              </section>
            )}
            {p.error && (
              <p className="sd-error" role="alert">
                {p.error}
              </p>
            )}
          </div>
        </div>

        <Vision st={st} />

        <form
          className="sd-reply"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <div className="sd-reply-in">
            <label htmlFor="sd-reply" className="v0-sr">
              Reply in your own words
            </label>
            <textarea
              id="sd-reply"
              rows={1}
              value={reply}
              placeholder={stage ? (stage.allowText || stage.control === 'fields' ? 'Answer in your own words, or say what to change' : 'Say what to change, “back”, or “surprise me”') : 'Say what to change, or “start”'}
              onChange={(e) => setReply(e.target.value.slice(0, 1200))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button type="submit" className="sd-send" disabled={!reply.trim()} aria-label="Send">
              <ArrowUp size={17} />
            </button>
          </div>
          <p className="sd-reply-hint">
            {systemName && st.mode !== 'critique' && st.mode !== 'system' ? `Made in ${systemName}. ` : ''}
            Nothing here calls a model.
          </p>
        </form>

        {ctxOpen && <button type="button" className="sd-scrim" aria-label="Close the decisions" onClick={() => setCtxOpen(false)} />}
        <aside id="sd-decisions" className={`sd-side${ctxOpen ? ' is-open' : ''}`} aria-label="Design context" aria-hidden={!ctxOpen}>
          <div className="sd-side-head">
            <button type="button" className="sd-icon sd-side-close" onClick={() => setCtxOpen(false)} aria-label="Close the decisions">
              <Close size={16} />
            </button>
          </div>
          <DesignContext st={st} env={env} onChange={reopenIt} systemName={systemName} />
          <div className="sd-side-foot">
            {st.mode !== 'critique' && st.mode !== 'system' && (
              <div className="sd-side-sys">
                <SystemPicker systems={p.systems} value={st.systemId ?? null} onChange={p.onSystem} onManage={p.onManageSystems} />
              </div>
            )}
            {stage && ready.canStart && (
              <button type="button" className="sd-pill is-primary is-block" onClick={() => begin(st)}>
                {START_LABEL[st.mode]}
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
