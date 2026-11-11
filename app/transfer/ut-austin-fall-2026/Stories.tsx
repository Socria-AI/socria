'use client';

// app/transfer/ut-austin-fall-2026/Stories.tsx — the Reddit CAP stories, as
// stories: where each student went, what they said they did, how much it can
// be leaned on, and where they said it. Never counted into a rate. Beside
// them, what UT and UTA themselves say CAP guarantees.

import { useState } from 'react';
import { CAP_REPORTS, CAP_RULES, CONFIDENCE_LABEL, DESTINATIONS, type Destination } from '@/lib/transfer/cap-reports';

export function Stories() {
  const [to, setTo] = useState<Destination | null>(null);
  const list = to ? CAP_REPORTS.filter((r) => r.destination === to) : CAP_REPORTS;
  const count = (d: Destination) => CAP_REPORTS.filter((r) => r.destination === d).length;

  return (
    <div className="xf-stories">
      <div className="xf-filters xf-story-filters" role="group" aria-label="Where they went">
        <div className="xf-chips-row">
          <button type="button" className={`xf-pick${to == null ? ' is-on' : ''}`} aria-pressed={to == null} onClick={() => setTo(null)}>
            Everywhere <em>{CAP_REPORTS.length}</em>
          </button>
          {DESTINATIONS.map((d) => (
            <button key={d} type="button" className={`xf-pick${to === d ? ' is-on' : ''}`} aria-pressed={to === d} onClick={() => setTo(to === d ? null : d)}>
              {d} <em>{count(d)}</em>
            </button>
          ))}
        </div>
      </div>

      <section className="xf-rules" aria-labelledby="xf-rules-h">
        <h2 id="xf-rules-h">What CAP actually guarantees</h2>
        <ul>
          <li>{CAP_RULES.guarantee}</li>
          <li>{CAP_RULES.requirements}</li>
          <li>{CAP_RULES.mccombs}</li>
          <li>{CAP_RULES.dates}</li>
        </ul>
        <p className="xf-rules-src">
          From UT and UTA&rsquo;s own pages, which change: check them before you plan around a date or a course.{' '}
          {CAP_RULES.sources.map((s, i) => (
            <span key={s.url}>
              {i ? ' · ' : ''}
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            </span>
          ))}
        </p>
      </section>

      <ol className="xf-story-list">
        {list.map((r) => (
          <li key={r.id} className="xf-story">
            <header className="xf-story-head">
              <p className="xf-story-route">
                {r.school ? `${r.school} CAP` : 'CAP'} <span aria-hidden>→</span> {r.destination}
              </p>
              <span className={`xf-conf is-${r.confidence}`}>{CONFIDENCE_LABEL[r.confidence]}</span>
            </header>
            <h3>{r.outcome}</h3>
            <dl className="xf-story-facts">
              <div>
                <dt>GPA</dt>
                <dd>{r.gpa != null ? (Number.isInteger(r.gpa) ? r.gpa.toFixed(1) : String(r.gpa)) : 'Not said'}</dd>
              </div>
              {r.hours != null ? (
                <div>
                  <dt>Hours</dt>
                  <dd>{r.hours}</dd>
                </div>
              ) : null}
              {r.cycle ? (
                <div>
                  <dt>Year</dt>
                  <dd>{r.cycle}</dd>
                </div>
              ) : null}
            </dl>
            <ul className="xf-story-did">
              {r.did.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="xf-story-take">{r.takeaway}</p>
            <a className="xf-story-src" href={r.url} target="_blank" rel="noopener noreferrer nofollow">
              Read the post on Reddit <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ol>
      <p className="xf-story-note">
        Stories people chose to post, a few told by a parent or a friend. Nobody checked them, and they are not a fair sample of CAP students, so they
        show what has worked for someone, not what will.
      </p>
    </div>
  );
}
