// components/site/One.tsx — Socria One, from `Socria One` in the design
// project: the cover in the deep blue, the position, what One holds, and the
// join band.
//
// THE NUMBERS ARE READ, NOT WRITTEN. The price comes from lib/socria-one and
// every count from the plan table (lib/entitlements), so this page, the
// paywall and the checkout cannot disagree about what One costs or holds.
// Each chapter says what Free allows beside what One does, from the table:
// the free plan is a real plan with real numbers, and saying them plainly is
// what makes the price believable.

import { OneMark } from '@/components/ds';
import { limitOf, megabytes, PLANS } from '@/lib/entitlements';
import { priceLabel, SOCRIA_ONE } from '@/lib/socria-one';
import { CHARTER, DOCS, HOME, PRIVACY, SiteFoot, SiteMast, SitePage, START, TERMS } from './chrome';
import { OneJoin } from './OneJoin';

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** A count as the page says it: a word to twelve, a numeral after. */
const said = (n: number | null) => (n === null ? 'every' : WORDS[n] ?? String(n));
/** A free allowance with its noun: "ten conversations", "one document". */
const count = (n: number | null, one: string, many: string) => `${said(n)} ${n === 1 ? one : many}`;
const free = (c: Parameters<typeof limitOf>[1]) => limitOf('free', c);

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
    title: 'Conversations',
    body: 'Begin as many lines of thinking in a month as you actually have, and keep every one of them open.',
    free: `Free starts ${count(free('chats'), 'conversation', 'conversations')} a month`,
    one: 'One does not count them',
  },
  {
    n: 'II.',
    title: 'Logic Maps',
    body: 'Every conversation drawn as a map of your own ideas, as large as the thinking gets.',
    free: `Free draws ${count(free('maps'), 'map', 'maps')} and ${count(free('nodes'), 'node', 'nodes')} a month`,
    one: 'One does not count them',
  },
  {
    n: 'III.',
    title: 'Artifacts and documents',
    body: `Make what the work needs — charts, models, worked solutions — and bring in whole reports and papers, up to ${megabytes(PLANS.one.uploadBytes)} on One, read with every citation checked against the page.`,
    free: `Free makes ${count(free('artifacts'), 'artifact', 'artifacts')} and reads ${count(free('documents'), 'document', 'documents')} a month`,
    one: 'One does not count them',
  },
  {
    n: 'IV.',
    title: 'Socria Voice',
    body: 'Talk instead of typing. Say what you think, pause when you need to, and tell Socria what to do next out loud.',
    free: 'Free does not include it',
    one: 'One includes it',
  },
  {
    n: 'V.',
    title: 'Sharing',
    body: 'Share a conversation with its map, or a whole Project, and think it through together.',
    free: 'Free joins what others share',
    one: 'One shares your own',
  },
  {
    n: 'VI.',
    title: 'Memory',
    body: 'Personalisation that learns how you reason, not just what you ask, and carries it into every later conversation.',
    free: `Free remembers ${said(PLANS.free.memoryEntries)} things about you`,
    one: `One remembers ${said(PLANS.one.memoryEntries)}`,
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
          <p className="s-one-stand">Unlimited Socria, with Voice and sharing. Socria is free to start.</p>
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
              Free Socria is the whole way of thinking, counted by the month. <em>One stops counting.</em>
            </p>
            <p className="s-pos-body">
              Free uses the same models, draws the same maps and asks the same questions back, up to its monthly
              allowance. One has no allowance to run out of, and adds the two things only it includes: Socria Voice,
              and sharing your conversations with other people.
            </p>
          </div>
        </section>

        <section className="s-sec s-led" aria-labelledby="s-led-h">
          <div className="s-wrap">
            <div className="s-one-head">
              <span>II.</span>
              <span>What One holds</span>
            </div>
            <h2 id="s-led-h">Six things, and no count on any of them.</h2>
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
                Unlimited Socria, with Voice and sharing.{' '}
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
