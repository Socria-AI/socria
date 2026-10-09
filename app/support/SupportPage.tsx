'use client';

// app/support/SupportPage.tsx — the questions people actually arrive with.
//
// Ported from the design project's support.jsx. The answers themselves are
// data (lib/support-faq.ts) so they can be checked by a test; this is the
// surface over them: search, topic chips, an accordion, the status card, and
// the one way to reach a person.
//
// THE FORM ACTUALLY SENDS SOMETHING, which is the one place this departs from
// the prototype. There, pressing it set `sent` to true and that was all — a
// design can mime a backend and nothing is lost, but shipping it would mean a
// page that says "Sent. We will reply to the address on your account." to
// somebody whose message went nowhere. The worst thing a support page can do
// is take a message and drop it. So the button composes a real mail, to the
// real address, with what they wrote in it; the page says what it is about to
// do rather than claiming to have done it.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Colophon } from '@/components/Colophon';
import {
  SUPPORT_EMAIL,
  TOPICS,
  allItems,
  filterTopics,
  highlight,
  type FaqItem,
} from '@/lib/support-faq';
import './support.css';

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

function QA({ item, term, forceOpen }: { item: FaqItem; term: string; forceOpen: boolean }) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  // Only ever our own strings from our own source — see lib/support-faq.ts.
  const h = (s: string) => ({ __html: highlight(s, term) });
  return (
    <div className="qa" data-open={isOpen}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={isOpen}>
        <span className="q" dangerouslySetInnerHTML={h(item.q)} />
        <span className="tw" aria-hidden="true">
          +
        </span>
      </button>
      {isOpen && (
        <div className="a">
          {item.a.map((p, i) => (
            <p key={i} dangerouslySetInnerHTML={h(p)} />
          ))}
          {item.steps && (
            <ol className="steps">
              {item.steps.map((s, i) => (
                <li key={i} dangerouslySetInnerHTML={h(s)} />
              ))}
            </ol>
          )}
          {item.after?.map((p, i) => (
            <p key={`x${i}`} dangerouslySetInnerHTML={h(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SupportPage() {
  const [term, setTerm] = useState('');
  const [topic, setTopic] = useState('all');
  const [about, setAbout] = useState('');
  const [msg, setMsg] = useState('');

  const t = term.trim().toLowerCase();
  const shown = useMemo(() => filterTopics(term, topic), [term, topic]);
  const total = shown.reduce((n, s) => n + s.qs.length, 0);
  const everything = allItems().length;

  // The whole message, as a mail. Encoded, so a line break or an ampersand in
  // what somebody wrote does not truncate their own message.
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `Support — ${about || 'Something else'}`
  )}&body=${encodeURIComponent(msg)}`;

  return (
    <div className="sp-root">
      <section className="qhead">
        <div className="qwrap">
          <span className="lbl moss">Support</span>
          <h1>
            What went <span className="em">wrong?</span>
          </h1>
          <p className="deck">
            Say it in your own words. Most answers are below; the rest go to a person.
          </p>
        </div>
      </section>

      <section className="sp-search">
        <div className="qwrap">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="cancel, sign in, memory, the map…"
            aria-label="Search support"
          />
          {term ? (
            <button type="button" className="clear" onClick={() => setTerm('')}>
              Clear
            </button>
          ) : (
            <span className="hint">{everything} answers</span>
          )}
        </div>
      </section>

      <section className="sp-topics">
        <div className="qwrap">
          <div className="row">
            {[{ id: 'all', t: 'Everything', qs: [] }, ...TOPICS].map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip${topic === s.id ? ' on' : ''}`}
                aria-pressed={topic === s.id}
                onClick={() => setTopic(s.id)}
              >
                {s.t}
                <span className="ct">{s.id === 'all' ? everything : s.qs.length}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="sp-body">
        <div className="qwrap sp-grid">
          <div>
            {total === 0 && (
              <div className="sp-none">
                <h2>Nothing here matches “{term}”.</h2>
                <p>
                  Which usually means it is a good question. Write it in the panel and a person
                  will answer it.
                </p>
              </div>
            )}
            {shown.map((s) => (
              <div className="sp-sec" key={s.id}>
                <div className="sh">
                  <span className="rn">{ROMAN[TOPICS.findIndex((x) => x.id === s.id)]}.</span>
                  <h2>{s.t}</h2>
                  <span className="ct">
                    {s.qs.length} {s.qs.length === 1 ? 'answer' : 'answers'}
                  </span>
                </div>
                {s.qs.map((it, i) => (
                  <QA key={s.id + i + t} item={it} term={t} forceOpen={!!t} />
                ))}
              </div>
            ))}
          </div>

          <aside className="sp-side">
            <div className="sp-card">
              <span className="lbl">Right now</span>
              {/* What is actually true of the product today. A status panel that
                  says "Working" about everything, for ever, is decoration. */}
              <div className="sp-status">
                <div>
                  <span className="dt" />
                  Core 4<span className="st">Working</span>
                </div>
                <div>
                  <span className="dt" />
                  Core 3.1<span className="st">Working</span>
                </div>
                <div>
                  <span className="dt" />
                  Logos 3<span className="st">Open to everyone</span>
                </div>
                <div>
                  <span className="dt" />
                  Logos 2<span className="st">Working</span>
                </div>
                <div>
                  <span className="dt" />
                  Sign-in and billing<span className="st">Working</span>
                </div>
                <div>
                  <span className="dt note" />
                  Core 2<span className="st warn">Retiring 2 October</span>
                </div>
              </div>
            </div>

            <div className="sp-card">
              <span className="lbl moss">Write to a person</span>
              <h3>Nobody here is a bot.</h3>
              <p>
                A person on the team reads every message, usually within a working day.{' '}
                <em>Say what you were trying to do</em>, not only what broke.
              </p>
              <div className="sp-form">
                <label htmlFor="sp-about">About</label>
                <select
                  id="sp-about"
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                >
                  <option value="" disabled>
                    Pick one
                  </option>
                  {TOPICS.map((s) => (
                    <option key={s.id}>{s.t}</option>
                  ))}
                  <option>Something else</option>
                </select>
                <label htmlFor="sp-msg">What happened</label>
                <textarea
                  id="sp-msg"
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  placeholder="I was trying to…, and then…"
                />
                {/* An anchor, not a button: it opens their own mail with the
                    message already in it, so the thing they wrote is in front
                    of them when it is sent rather than swallowed by a page. */}
                <a
                  className="send"
                  href={mailto}
                  aria-disabled={msg.trim() ? undefined : 'true'}
                  tabIndex={msg.trim() ? undefined : -1}
                >
                  Open it in your mail
                </a>
                <p className="note">
                  Or write to{' '}
                  <a className="addr" href={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                  </a>{' '}
                  directly.
                </p>
              </div>
            </div>

            <div className="sp-card">
              <span className="lbl">Elsewhere</span>
              <p>
                <Link href="/docs">The docs</Link> go further than this page does — what each
                model is for, and how the parts fit together.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <div className="sp-body" style={{ paddingTop: 0 }}>
        <div className="qwrap">
          <Colophon />
        </div>
      </div>
    </div>
  );
}
