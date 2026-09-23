'use client';

// The Memory page's second half: what Core 4 recorded about the person's
// THINKING, as opposed to what Socria knows about them (the Mind Graph above).
//
// Three things, each with the person in charge of it:
//
//   the Reasoning Ledger   claims, objections, alternatives, decisions —
//                          split by whose they are. "Yours" is only what is
//                          grounded in their own words; Socria's ideas are
//                          marked Socria's; anything else is unattributed and
//                          never said back to them as theirs.
//   the Cognitive State    per conversation: what they SAID they want, kept
//                          apart from what Core 4 inferred (with how sure,
//                          and why). Inferred fields can be set or reset.
//   capability evidence    counted events, per concept. Deletable.
//
// Everything goes through /api/core4. Nothing is hidden here that the model
// can see: if Core 4 uses it, it is on this page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import './core4-record.css';

type Entry = {
  id: string; kind: string; text: string; owner: 'user' | 'socria' | 'unknown'; stance: string; basis: string;
  quote: string; reason: string; status: string; conversationId: string; updatedAt: number;
};
type Field = { field: string; value: string; source: string; confidence: number; evidence: string };
type StateSummary = { conversationId: string; updatedAt: number; turn: number; work: string; focus: string; said: Field[]; inferred: Field[] };
type Concept = { concept: string; assisted: number; unassisted: number; misunderstandings: number; independentAfterHelp: boolean };

const STANCE: Record<string, string> = { asserts: 'you hold', entertains: 'you raised', asks: 'you asked', rejects: 'you ruled out', accepts: 'you accepted', resolved: 'you settled' };
const FIELD: Record<string, string> = { learningGoal: 'Learning this themselves', expertise: 'Expertise', stakes: 'Stakes', authorship: 'The work must be theirs', directness: 'Wants the answer' };
const CHOICES: Record<string, string[]> = { learningGoal: ['yes', 'no'], expertise: ['novice', 'intermediate', 'expert'], stakes: ['low', 'medium', 'high'], authorship: ['theirs', 'shared', 'none'] };
const SHOW = 12;

function when(t: number) {
  return t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}

export function Core4Record() {
  const [data, setData] = useState<{ entries: Entry[]; states: StateSummary[]; capability: Concept[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [all, setAll] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/core4', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setErr('');
    } catch {
      setErr('Could not load what Core 4 recorded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, init: RequestInit & { url?: string }) => {
    setBusy(key);
    try {
      const r = await fetch(init.url ?? '/api/core4', { ...init, headers: { 'Content-Type': 'application/json' } });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'failed');
      await load();
    } catch (e) {
      setErr(e instanceof Error && e.message !== 'failed' ? e.message : 'That did not save. Try again.');
    } finally {
      setBusy('');
      setEditing(null);
    }
  };
  const patchEntry = (id: string, action: string, text?: string) => act(`${id}:${action}`, { method: 'PATCH', body: JSON.stringify({ entryId: id, action, ...(text ? { text } : {}) }) });
  const delEntry = (id: string) => act(`${id}:del`, { method: 'DELETE', url: `/api/core4?entryId=${encodeURIComponent(id)}` });

  const groups = useMemo(() => {
    const es = (data?.entries ?? []).filter((e) => e.status !== 'retracted' || e.owner === 'user');
    return {
      yours: es.filter((e) => e.owner === 'user'),
      socria: es.filter((e) => e.owner === 'socria'),
      unknown: es.filter((e) => e.owner === 'unknown'),
    };
  }, [data]);

  if (err && !data) return <section className="c4-root"><p className="c4-err" role="alert">{err}</p></section>;
  if (!data) return null;
  const empty = !data.entries.length && !data.states.length && !data.capability.length;

  const list = (key: string, es: Entry[], render: (e: Entry) => JSX.Element) => (
    <>
      <ul className="c4-list">{(all[key] ? es : es.slice(0, SHOW)).map(render)}</ul>
      {es.length > SHOW && !all[key] && <button className="c4-more" onClick={() => setAll({ ...all, [key]: true })}>Show all {es.length}</button>}
    </>
  );

  return (
    <section className="c4-root" aria-labelledby="c4-h">
      <div className="c4-head">
        <span className="c4-kicker">Core 4</span>
        <h2 id="c4-h">How Core 4 read your thinking</h2>
        <p className="c4-deck">
          What Core 4 recorded while thinking with you. Only what is grounded in your own words is marked <em>yours</em>; Socria&rsquo;s
          ideas stay Socria&rsquo;s; guesses are labelled as guesses. Correct anything here, or delete it. None of it is used to train models.
        </p>
        {err && <p className="c4-err" role="alert">{err}</p>}
      </div>

      {empty && <p className="c4-empty">Nothing yet. This fills in as you use Core 4.</p>}

      {groups.yours.length > 0 && (
        <div className="c4-sec">
          <h3>Your reasoning <span className="n">{groups.yours.length}</span></h3>
          {list('yours', groups.yours, (e) => (
            <li key={e.id} className={`c4-item s-${e.status}`}>
              <span className="c4-kind">{e.kind}</span>
              {editing?.id === e.id ? (
                <form className="c4-edit" onSubmit={(ev) => { ev.preventDefault(); void patchEntry(e.id, 'edit', editing.text); }}>
                  <textarea value={editing.text} maxLength={280} rows={2} onChange={(ev) => setEditing({ id: e.id, text: ev.target.value })} aria-label="What you meant" />
                  <div className="c4-acts">
                    <button type="submit" disabled={!!busy}>Save</button>
                    <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <p className="c4-text">
                  <span className="c4-stance">{e.status === 'disputed' ? 'you corrected' : e.status === 'retracted' ? 'you retracted' : STANCE[e.stance] ?? 'you raised'}</span>{' '}
                  {e.text}
                  {e.reason && <span className="c4-why"> — because {e.reason}</span>}
                </p>
              )}
              <div className="c4-meta">
                <span>{e.basis === 'quoted' ? 'in your words' : 'close to your words'}</span>
                <span>{when(e.updatedAt)}</span>
              </div>
              {editing?.id !== e.id && (
                <div className="c4-acts">
                  <button disabled={!!busy} onClick={() => setEditing({ id: e.id, text: e.text })}>Edit</button>
                  <button disabled={!!busy} onClick={() => patchEntry(e.id, 'disown')} title="This was not my idea">Not mine</button>
                  {e.status === 'retracted' || e.status === 'disputed'
                    ? <button disabled={!!busy} onClick={() => patchEntry(e.id, 'restore')}>Restore</button>
                    : <button disabled={!!busy} onClick={() => patchEntry(e.id, 'retract')} title="I no longer hold this">Retract</button>}
                  <button className="del" disabled={!!busy} onClick={() => delEntry(e.id)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </div>
      )}

      {groups.socria.length > 0 && (
        <div className="c4-sec">
          <h3>What Socria contributed <span className="n">{groups.socria.length}</span></h3>
          <p className="c4-note">Recorded so Core 4 does not repeat itself — and so none of it is ever handed back to you as your idea.</p>
          {list('socria', groups.socria, (e) => (
            <li key={e.id} className="c4-item">
              <span className="c4-kind">{e.kind}</span>
              <p className="c4-text">{e.text}</p>
              <div className="c4-acts"><button className="del" disabled={!!busy} onClick={() => delEntry(e.id)}>Delete</button></div>
            </li>
          ))}
        </div>
      )}

      {groups.unknown.length > 0 && (
        <div className="c4-sec">
          <h3>Noticed, but not in your words <span className="n">{groups.unknown.length}</span></h3>
          <p className="c4-note">Core 4&rsquo;s reading, not something you said. It only stops Core 4 raising the same thing again; it is never said back to you as yours.</p>
          {list('unknown', groups.unknown, (e) => (
            <li key={e.id} className="c4-item">
              <span className="c4-kind">{e.kind}</span>
              {editing?.id === e.id ? (
                <form className="c4-edit" onSubmit={(ev) => { ev.preventDefault(); void patchEntry(e.id, 'edit', editing.text); }}>
                  <textarea value={editing.text} maxLength={280} rows={2} onChange={(ev) => setEditing({ id: e.id, text: ev.target.value })} aria-label="In your words" />
                  <div className="c4-acts">
                    <button type="submit" disabled={!!busy}>Save as mine</button>
                    <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <p className="c4-text">{e.text}</p>
              )}
              {editing?.id !== e.id && (
                <div className="c4-acts">
                  <button disabled={!!busy} onClick={() => setEditing({ id: e.id, text: e.text })}>This is mine — put it in my words</button>
                  <button className="del" disabled={!!busy} onClick={() => delEntry(e.id)}>Delete</button>
                </div>
              )}
            </li>
          ))}
        </div>
      )}

      {data.states.length > 0 && (
        <div className="c4-sec">
          <h3>What Core 4 took into account <span className="n">{data.states.length}</span></h3>
          <p className="c4-note">Per conversation. What you said is kept apart from what Core 4 inferred; an inference never decides to hold anything back from you.</p>
          <ul className="c4-list">
            {(all.states ? data.states : data.states.slice(0, 6)).map((s) => (
              <li key={s.conversationId} className="c4-item c4-state">
                <p className="c4-text"><span className="c4-stance">{s.work}</span> {s.focus || 'this conversation'}</p>
                <div className="c4-fields">
                  {s.said.map((f) => (
                    <div key={f.field} className="c4-field said">
                      <span className="k">{FIELD[f.field] ?? f.field}</span>
                      <span className="v">{f.value}</span>
                      <span className="src">{f.evidence.startsWith('Project:') ? 'your Project says so' : 'you said so'}</span>
                    </div>
                  ))}
                  {s.inferred.map((f) => (
                    <div key={f.field} className="c4-field inferred">
                      <span className="k">{FIELD[f.field] ?? f.field}</span>
                      <span className="v">{f.value}</span>
                      <span className="src">a guess · {Math.round(f.confidence * 100)}% sure{f.evidence ? ` · ${f.evidence}` : ''}</span>
                      {CHOICES[f.field] && (
                        <span className="c4-acts">
                          <select
                            aria-label={`Set ${FIELD[f.field] ?? f.field}`}
                            disabled={!!busy}
                            value=""
                            onChange={(ev) => ev.target.value && act(`${s.conversationId}:${f.field}`, { method: 'PATCH', body: JSON.stringify({ conversationId: s.conversationId, field: f.field, value: ev.target.value }) })}
                          >
                            <option value="">Set it…</option>
                            {CHOICES[f.field].map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button disabled={!!busy} onClick={() => act(`${s.conversationId}:${f.field}`, { method: 'PATCH', body: JSON.stringify({ conversationId: s.conversationId, field: f.field, value: null }) })}>Forget the guess</button>
                        </span>
                      )}
                    </div>
                  ))}
                  {!s.said.length && !s.inferred.length && <p className="c4-note">Nothing recorded beyond the kind of work.</p>}
                </div>
                <div className="c4-acts">
                  <button className="del" disabled={!!busy} onClick={() => act(`${s.conversationId}:del`, { method: 'DELETE', url: `/api/core4?conversationId=${encodeURIComponent(s.conversationId)}` })}>Forget this conversation&rsquo;s state</button>
                </div>
              </li>
            ))}
          </ul>
          {data.states.length > 6 && !all.states && <button className="c4-more" onClick={() => setAll({ ...all, states: true })}>Show all {data.states.length}</button>}
        </div>
      )}

      {data.capability.length > 0 && (
        <div className="c4-sec">
          <h3>What you have shown you can do <span className="n">{data.capability.length}</span></h3>
          <p className="c4-note">Counted events, not a score: when you got something right on your own, with help, or not yet. &ldquo;On your own, later&rdquo; only counts in a different conversation from the one where you had help.</p>
          <ul className="c4-list">
            {data.capability.map((c) => (
              <li key={c.concept} className="c4-item c4-cap">
                <p className="c4-text">{c.concept}</p>
                <div className="c4-meta">
                  <span>{c.unassisted} on your own</span>
                  <span>{c.assisted} with help</span>
                  <span>{c.misunderstandings} not yet</span>
                  {c.independentAfterHelp && <span className="ok">on your own, later</span>}
                </div>
                <div className="c4-acts"><button className="del" disabled={!!busy} onClick={() => act(`cap:${c.concept}`, { method: 'DELETE', url: `/api/core4?concept=${encodeURIComponent(c.concept)}` })}>Delete</button></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
