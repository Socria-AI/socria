// components/site/One.tsx — Socria One, from `Socria One` in the design
// project: the cover in the deep blue, the position, the five things One
// holds, and the join band.
//
// THE NUMBERS ARE READ, NOT WRITTEN. The price comes from lib/socria-one and
// every count from the plan table (lib/entitlements, lib/share/roles), so
// this page and the checkout cannot disagree about what One costs or holds.
// One line departs from the design for that reason: it had free "remember
// the conversation", but free carries twelve things about you between
// conversations — so the ledger says that, from the table.

import { OneMark } from '@/components/ds';
import { PLANS } from '@/lib/entitlements';
import { FREE_SHARED_CHATS } from '@/lib/share/roles';
import { priceLabel, SOCRIA_ONE } from '@/lib/socria-one';
import { CHARTER, DOCS, HOME, PRIVACY, SiteFoot, SiteMast, SitePage, START, TERMS } from './chrome';
import { OneJoin } from './OneJoin';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** A count as the page says it: a word to twelve, a numeral after. */
const said = (n: number | null) => (n === null ? 'every' : WORDS[n] ?? String(n));

interface Chapter {
  n: string;
  title: string;
  body: string;
  free: string;
  one: string;
}

const CHAPTERS: Chapter[] = [
  {
    n: 'I.',
    title: 'Lines of thinking',
    body: 'Begin as many lines of thinking in a month as you actually have. A fair-use ceiling sits where serious work does not reach it.',
    free: 'Free counts them by the month',
    one: 'One does not count them',
  },
  {
    n: 'II.',
    title: 'Messages',
    body: 'No daily count. Talk it through for as long as the question takes, and come back to it tomorrow without starting over.',
    free: 'Free counts messages by the day',
    one: 'One does not',
  },
  {
    n: 'III.',
    title: 'Memory',
    body: 'Personalisation that learns how you reason, not just what you ask, and carries it into every later conversation.',
    free: `Free remembers ${said(PLANS.free.memoryEntries)} things about you`,
    one: `One remembers ${said(PLANS.one.memoryEntries)}`,
  },
  {
    n: 'IV.',
    title: 'Documents',
    body: 'Longer documents: whole reports and papers, the real material, read with every citation checked against the page.',
    free: 'Free reads the short ones',
    one: 'One reads the long ones',
  },
  {
    n: 'V.',
    title: 'Sharing',
    body: 'Share as many conversations as you like, all at once, each with its map.',
    free: `Free shares ${said(FREE_SHARED_CHATS)} at a time`,
    one: 'One shares them all',
  },
];

export function One() {
  const price = priceLabel();
  const per = `a ${SOCRIA_ONE.period}`;
  return (
    <SitePage tone="one">
      <SiteMast links={[HOME, CHARTER, DOCS]} go={<OneJoin place="mast" />} />

      <main>
        <section className="s-sec s-one-cover" aria-labelledby="s-one-h">
          <div className="s-one-mark">
            <OneMark size={88} tone="dark" />
          </div>
          <p className="s-one-eb">Socria One · MMXXVI</p>
          <h1 id="s-one-h">
            Socria <em>One</em>
          </h1>
          <div className="s-one-price">
            <span className="s-one-amt">{price}</span>
            <span className="s-one-per">{per}</span>
          </div>
          <p className="s-one-stand">Everything Socria does, without the ceiling. Socria is free to start.</p>
          <div className="s-one-go">
            <OneJoin place="cover" />
            <a className="s-free" href={START}>
              continue with the free tier
            </a>
          </div>
        </section>

        <section className="s-sec s-pos" aria-label="The position">
          <div className="s-wrap">
            <div className="s-one-head">
              <span>I.</span>
              <span>The position</span>
            </div>
            <p className="s-pos-claim">
              Free Socria is the whole product, with a ceiling. <em>One takes the ceiling off.</em>
            </p>
            <p className="s-pos-body">
              Nothing is held back from the free tier: the same models, the same map, the same questions asked back.
              What free counts, One does not. Talk it through for as long as the question takes, bring the whole
              document, and let Socria learn how you reason.
            </p>
          </div>
        </section>

        <section className="s-sec s-led" aria-labelledby="s-led-h">
          <div className="s-wrap">
            <div className="s-one-head">
              <span>II.</span>
              <span>What One holds</span>
            </div>
            <h2 id="s-led-h">Five things, and no count on any of them.</h2>
            {CHAPTERS.map((c) => (
              <div className="s-chapter" key={c.n}>
                <h3>
                  <span>{c.n}</span>
                  {c.title}
                </h3>
                <div className="s-chapter-body">
                  <p>{c.body}</p>
                  <p className="s-tiers">
                    <i aria-hidden="true" />
                    <span>{c.free}</span>
                    <b aria-hidden="true">·</b>
                    <i className="is-one" aria-hidden="true" />
                    <span>{c.one}</span>
                  </p>
                </div>
                <div>
                  <span className="s-incl">
                    <i aria-hidden="true">I</i>
                    Included with One
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="s-sec s-join" id="join" aria-label="Join">
          <div className="s-wrap s-join-in">
            <div>
              <p className="s-join-line">
                Everything Socria does, without the ceiling.{' '}
                <em>
                  {price} {per}.
                </em>
              </p>
              <div className="s-join-go">
                <OneJoin place="join" />
                <span className="s-join-note">Renews monthly until you cancel. Socria is free to start.</span>
              </div>
            </div>
            <SiteFoot links={[HOME, CHARTER, DOCS, TERMS, PRIVACY]} />
          </div>
        </section>
      </main>
    </SitePage>
  );
}
