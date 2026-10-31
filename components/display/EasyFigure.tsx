'use client';

// components/display/EasyFigure.tsx — AN EASY VIEW, drawn: a photo made large, clear and simple.
//
// For the person who cannot read the small print on a menu, a medicine label,
// a timetable or a letter — older eyes, low vision, a dim room. What the photo
// says (lib/objects/display-easy.ts) is set in big type from the start, and
// made easier still by the person, on this device:
//
//   bigger or smaller   A− / A+, four steps, kept for next time
//   high contrast       light words on ink, the accent sage — the brand's own
//                       pair, at 14:1
//   read it to me       the whole of it, aloud, in the browser's own voice; a
//                       press on any line reads that line
//   show only           what the photo marks — vegetarian, gluten free — and
//                       nothing else
//   at a glance         its prices as bars from lowest to highest, its times on
//                       a line with the next one marked, or its steps in order —
//                       computed from what was read, never drawn by a model
//
// Every control is a real button, 48px at least, with a word on it, not only a
// sign; nothing moves but what the person asks to; what could not be read is
// said, never filled in; and because a model read the photo, it says to check
// a dose, a date or an allergy against the original.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EASY_KIND_WORD, easyShape, easySpoken, glanceOf, itemSpoken, nextTime, tagsOf, type EasyGlance, type EasyItem, type EasyState } from '@/lib/objects/display-easy';
import type { FigureProps } from '@/components/objects/figures';
import { DisplayShell, useDisplay, type Display } from './DisplayShell';
import './easy.css';

/** How big the words are: four steps from large to very large, the second the start. */
export const EASY_SIZES = [1, 1.2, 1.45, 1.75] as const;
const PREFS_KEY = 'socria.easy.v1';
/** A photo is read by a model, and a model can misread: what matters is checked against the paper itself. */
const CHECK = 'Read from your photo. For anything that matters — a dose, a date, an allergy — check the original too.';

interface Prefs {
  size: number;
  contrast: boolean;
}

function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
    const size = Number.isInteger(v?.size) && v.size >= 0 && v.size < EASY_SIZES.length ? v.size : 1;
    return { size, contrast: v?.contrast === true };
  } catch {
    return { size: 1, contrast: false };
  }
}

function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* kept for this visit only */
  }
}

/** The browser's own voice, when it has one: lines read in order, a little slower than usual; one thing at a time. */
function useSpeech() {
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState<string | null>(null);
  useEffect(() => {
    const has = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
    setOk(has);
    return () => {
      if (has) window.speechSynthesis.cancel();
    };
  }, []);
  const stop = () => {
    if (ok) window.speechSynthesis.cancel();
    setOn(null);
  };
  const say = (lines: string[], key: string) => {
    if (!ok) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    if (on === key) return setOn(null);
    setOn(key);
    lines.forEach((line, i) => {
      const u = new SpeechSynthesisUtterance(line);
      u.rate = 0.92;
      if (i === lines.length - 1) {
        u.onend = () => setOn((k) => (k === key ? null : k));
        u.onerror = () => setOn((k) => (k === key ? null : k));
      }
      synth.speak(u);
    });
  };
  return { ok, on, say, stop };
}

export function EasyFigure(p: FigureProps) {
  const d = useDisplay<EasyState>(p);
  if (p.mode !== 'live')
    return (
      <DisplayShell p={p} d={d}>
        {null}
      </DisplayShell>
    );
  return <Easy p={p} d={d} />;
}

function Easy({ p, d }: { p: FigureProps; d: Display<EasyState> }) {
  const s = d.state;
  const [prefs, setPrefs] = useState<Prefs>({ size: 1, contrast: false });
  useEffect(() => setPrefs(readPrefs()), []);
  const put = (next: Prefs) => {
    setPrefs(next);
    writePrefs(next);
  };
  const speech = useSpeech();
  const tags = useMemo(() => tagsOf(s), [s]);
  const [only, setOnly] = useState<string | null>(null);
  useEffect(() => {
    if (only && !tags.includes(only)) setOnly(null);
  }, [tags, only]);
  const g = useMemo(() => glanceOf(s), [s]);
  const shows = (t: readonly string[] | undefined) => !only || (t ?? []).includes(only);
  const glance = s.view === 'glance' && !!g.kind;
  return (
    <DisplayShell p={p} d={d} aside={easyShape(s)}>
      <div className={`ez${prefs.contrast ? ' is-hc' : ''}`} style={{ ['--ez' as string]: EASY_SIZES[prefs.size] }} data-size={prefs.size}>
        <div className="ez-bar" role="toolbar" aria-label="Make it easier to read">
          <span className="ez-size" role="group" aria-label="Size of the words">
            <button type="button" className="ez-btn" onClick={() => put({ ...prefs, size: prefs.size - 1 })} disabled={prefs.size <= 0} aria-label="Smaller words">
              <span className="ez-glyph" aria-hidden="true">
                <span className="ez-a is-sm">A</span>−
              </span>
              <span className="ez-btn-l" aria-hidden="true">
                Smaller
              </span>
            </button>
            <button type="button" className="ez-btn" onClick={() => put({ ...prefs, size: prefs.size + 1 })} disabled={prefs.size >= EASY_SIZES.length - 1} aria-label="Bigger words">
              <span className="ez-glyph" aria-hidden="true">
                <span className="ez-a is-lg">A</span>+
              </span>
              <span className="ez-btn-l" aria-hidden="true">
                Bigger
              </span>
            </button>
          </span>
          <button type="button" className={`ez-btn${prefs.contrast ? ' is-on' : ''}`} aria-pressed={prefs.contrast} onClick={() => put({ ...prefs, contrast: !prefs.contrast })}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
            </svg>
            <span className="ez-long">High contrast</span>
            <span className="ez-short">Contrast</span>
          </button>
          {speech.ok && (
            <button
              type="button"
              className={`ez-btn${speech.on === 'all' ? ' is-on' : ''}`}
              aria-pressed={speech.on === 'all'}
              onClick={() => (speech.on ? speech.stop() : speech.say(easySpoken(s), 'all'))}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
                <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
              </svg>
              <span className="ez-long">{speech.on ? 'Stop reading' : 'Read it to me'}</span>
              <span className="ez-short">{speech.on ? 'Stop' : 'Read aloud'}</span>
            </button>
          )}
        </div>
        {tags.length > 0 && (
          <div className="ez-only" role="group" aria-label="Show only">
            <span className="ez-only-l">Show only</span>
            {tags.map((t) => (
              <button key={t} type="button" className={`ez-chip${only === t ? ' is-on' : ''}`} aria-pressed={only === t} onClick={() => setOnly(only === t ? null : t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        {glance ? <Glance s={s} g={g} shows={shows} speech={speech} /> : <Read s={s} g={g} shows={shows} speech={speech} />}
        <p className="ez-check">{CHECK}</p>
      </div>
    </DisplayShell>
  );
}

type Speech = ReturnType<typeof useSpeech>;

/** A line that reads itself aloud when pressed — a plain line where the browser has no voice. */
function Line({ id, said, speech, className, children }: { id: string; said: string; speech: Speech; className: string; children: ReactNode }) {
  if (!speech.ok) return <div className={className}>{children}</div>;
  const on = speech.on === id;
  return (
    <button type="button" className={`${className} is-press${on ? ' is-saying' : ''}`} aria-pressed={on} title={on ? 'Stop' : 'Read this line aloud'} onClick={() => speech.say([said], id)}>
      {children}
    </button>
  );
}

function Read({ s, g, shows, speech }: { s: EasyState; g: EasyGlance; shows: (t?: readonly string[]) => boolean; speech: Speech }) {
  const visible = s.sections.map((sec) => ({ ...sec, items: sec.items.filter((it) => shows(it.tags)) })).filter((sec) => sec.items.length);
  return (
    <div className="ez-read">
      <p className="ez-kind">{EASY_KIND_WORD[s.kind]}</p>
      <h3 className="ez-title">{s.title}</h3>
      {s.summary && <p className="ez-summary">{s.summary}</p>}
      {s.warnings.length > 0 && <Warnings list={s.warnings} />}
      {s.facts.length > 0 && (
        <dl className="ez-facts">
          {s.facts.map((f) => (
            <div key={`${f.label}|${f.value}`} className="ez-fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {visible.map((sec) => (
        <section key={sec.id} className="ez-sec" aria-label={sec.title || undefined}>
          {sec.title && <h4 className="ez-sec-h">{sec.title}</h4>}
          <ul className="ez-items">
            {sec.items.map((it) => (
              <li key={it.id}>
                <Item it={it} speech={speech} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {s.sections.length > 0 && !visible.length && <p className="ez-none">Nothing on it is marked that way.</p>}
      {s.steps.length > 0 && <Steps steps={s.steps} speech={speech} />}
      {s.times.length > 0 && <Times g={g} speech={speech} />}
      {s.unclear.length > 0 && (
        <p className="ez-unclear">
          <span>Could not be read</span> {s.unclear.join(' · ')}
        </p>
      )}
    </div>
  );
}

function Item({ it, speech }: { it: EasyItem; speech: Speech }) {
  return (
    <Line id={it.id} said={itemSpoken(it)} speech={speech} className="ez-item">
      <span className="ez-item-top">
        <span className="ez-name">{it.name}</span>
        {it.value && <span className="ez-value">{it.value}</span>}
      </span>
      {it.detail && <span className="ez-detail">{it.detail}</span>}
      {it.tags?.length ? (
        <span className="ez-tags">
          {it.tags.map((t) => (
            <span key={t} className="ez-tag">
              {t}
            </span>
          ))}
        </span>
      ) : null}
    </Line>
  );
}

function Warnings({ list }: { list: string[] }) {
  return (
    <div className="ez-warn" role="note">
      <p className="ez-warn-h">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4.5M12 17.5h0" />
        </svg>
        Please note
      </p>
      <ul>
        {list.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function Steps({ steps, speech }: { steps: string[]; speech: Speech }) {
  return (
    <ol className="ez-steps" aria-label="Steps">
      {steps.map((st, i) => (
        <li key={i}>
          <Line id={`step${i + 1}`} said={`Step ${i + 1}: ${st}`} speech={speech} className="ez-step">
            <span className="ez-step-n" aria-hidden="true">
              {i + 1}
            </span>
            <span className="ez-step-t">{st}</span>
          </Line>
        </li>
      ))}
    </ol>
  );
}

/** The minute of the day now, read after the page is drawn — so the next time is marked by this device's clock, and again each minute. */
function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const read = () => {
      const t = new Date();
      setNow(t.getHours() * 60 + t.getMinutes());
    };
    read();
    const id = setInterval(read, 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Times({ g, speech }: { g: EasyGlance; speech: Speech }) {
  const now = useNow();
  const next = now === null ? -1 : nextTime(g.times, now);
  return (
    <ol className="ez-times" aria-label="Times">
      {g.times.map((t, i) => {
        const isNext = i === next;
        const wait = isNext && now !== null && t.minutes !== null ? t.minutes - now : null;
        return (
          <li key={`${t.time}|${t.label}|${i}`} className={isNext ? 'is-next' : undefined}>
            <Line id={`time${i}`} said={`${t.time}${t.label ? `, ${t.label}` : ''}`} speech={speech} className="ez-time-row">
              <span className="ez-time">{t.time}</span>
              <span className="ez-time-l">{t.label}</span>
              {isNext && <span className="ez-next">{wait === 0 ? 'Now' : wait !== null ? `Next · in ${wait < 60 ? `${wait} min` : `${Math.floor(wait / 60)} h ${wait % 60} min`}` : 'Next'}</span>}
            </Line>
          </li>
        );
      })}
    </ol>
  );
}

function Glance({ s, g, shows, speech }: { s: EasyState; g: EasyGlance; shows: (t?: readonly string[]) => boolean; speech: Speech }) {
  if (g.kind === 'times') {
    return (
      <div className="ez-glance">
        <p className="ez-glance-h">The times, in order — the next one marked</p>
        <Times g={g} speech={speech} />
      </div>
    );
  }
  if (g.kind === 'steps') {
    return (
      <div className="ez-glance">
        <p className="ez-glance-h">What to do, one step at a time</p>
        <Steps steps={s.steps} speech={speech} />
      </div>
    );
  }
  const list = [...g.prices].filter((x) => shows(x.tags)).sort((a, b) => a.n - b.n || a.name.localeCompare(b.name));
  const max = Math.max(...g.prices.map((x) => x.n));
  const lo = list[0];
  const hi = list[list.length - 1];
  return (
    <div className="ez-glance">
      <p className="ez-glance-h">Prices, from lowest to highest</p>
      {list.length ? (
        <ul className="ez-bars">
          {list.map((x) => (
            <li key={x.id}>
              <Line id={`bar-${x.id}`} said={`${x.name}, ${x.value}`} speech={speech} className="ez-bar-row">
                <span className="ez-bar-top">
                  <span className="ez-bar-name">
                    {x.name}
                    {x.section && <em>{x.section}</em>}
                  </span>
                  <span className="ez-bar-value">{x.value}</span>
                </span>
                <span className="ez-bar-track" aria-hidden="true">
                  <i style={{ width: `${Math.max(4, Math.round((x.n / max) * 100))}%` }} />
                </span>
              </Line>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ez-none">Nothing with a price is marked that way.</p>
      )}
      {lo && hi && lo !== hi && (
        <p className="ez-glance-foot">
          Lowest: <b>{lo.name}</b>, {lo.value} · Highest: <b>{hi.name}</b>, {hi.value}
        </p>
      )}
    </div>
  );
}
