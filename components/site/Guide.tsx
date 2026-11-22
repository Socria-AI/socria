// components/site/Guide.tsx — a page that explains one thing properly: what Socratic AI is and how Socria uses it
// (/socratic-ai), what Socria does for a student (/for-students).
//
// Set like the Charter (one column of text inside the page margin, a serif voice), because these are pages to read,
// not to scan. A server component with nothing that runs in the browser: every word is in the HTML a search engine
// receives. The questions at the end are visible on the page and are the same words the page's FAQPage data carries
// (faqOf), so the structured data never says what the page does not.
//
// Every claim on a guide is one the docs make about the product as it ships to everyone (app/docs/content), and none
// is an outcome: Socria has not been studied with the people who use it (docs: Logos 5, What it does not do), so a
// guide says what it does, never what it does for your grades.

import type { ReactNode } from 'react';
import { Button } from '@/components/ds';
import { SiteA, SiteFoot, SiteMast, SitePage, START, type SiteLink } from './chrome';

export interface GuideSection {
  id: string;
  heading: string;
  body: ReactNode;
}

export interface GuideQuestion {
  q: string;
  /** the answer's paragraphs, plain text: the page shows them, and the FAQPage data carries them word for word */
  a: readonly string[];
}

export interface GuideProps {
  eyebrow: string;
  title: string;
  deck: string;
  intro: ReactNode;
  sections: readonly GuideSection[];
  questions?: readonly GuideQuestion[];
  related: readonly SiteLink[];
  /** the call to action's words; it opens Socria (START) */
  cta: string;
  /** under the call to action */
  note: string;
}

/** The questions as the FAQPage structured data takes them (lib/structured-data.ts faqPageLd). */
export function faqOf(questions: readonly GuideQuestion[]): { q: string; a: readonly string[] }[] {
  return questions.map((x) => ({ q: x.q, a: x.a }));
}

export function Guide(p: GuideProps) {
  return (
    <SitePage>
      <SiteMast />
      <main>
        <article className="s-sec s-guide" aria-labelledby="s-guide-h">
          <p className="s-label s-guide-eb">{p.eyebrow}</p>
          <h1 id="s-guide-h">{p.title}</h1>
          <p className="s-guide-deck">{p.deck}</p>

          <div className="s-guide-body">
            {p.intro}
            {p.sections.map((s) => (
              <section key={s.id} aria-labelledby={`s-guide-${s.id}`}>
                <h2 id={`s-guide-${s.id}`}>{s.heading}</h2>
                {s.body}
              </section>
            ))}
            {p.questions?.length ? (
              <section aria-labelledby="s-guide-questions">
                <h2 id="s-guide-questions">Questions people ask</h2>
                {p.questions.map((x) => (
                  <div key={x.q} className="s-guide-qa">
                    <h3>{x.q}</h3>
                    {x.a.map((t) => (
                      <p key={t}>{t}</p>
                    ))}
                  </div>
                ))}
              </section>
            ) : null}
          </div>

          <div className="s-guide-go">
            <Button as="a" href={START} variant="primary" size="lg" arrow>
              {p.cta}
            </Button>
            <span className="s-go-note">{p.note}</span>
          </div>

          <nav className="s-guide-rel" aria-label="Read next">
            <p className="s-label">Read next</p>
            <ul>
              {p.related.map((l) => (
                <li key={l.href}>
                  <SiteA l={l} />
                </li>
              ))}
            </ul>
          </nav>
        </article>
      </main>
      <SiteFoot />
    </SitePage>
  );
}
