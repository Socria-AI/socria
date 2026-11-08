// components/site/One.tsx — Socria One, from `Socria One` in the design
// project (the 2026 page): paper, not the deep blue; the price in the
// headline; two cards for the two things One adds — conversations with no
// count, and sharing a map — and a foot that says how it renews.
//
// THE NUMBERS ARE READ, NOT WRITTEN. The price comes from lib/socria-one, so
// this page, the paywall and the checkout cannot disagree about what One
// costs. The two cards are pictures of the product, not controls: the list
// and the map are inert and hidden from a screen reader, and the heading and
// line under each say what the picture shows.

import { LogosNode, OneMark } from '@/components/ds';
import { ONE_HEADLINE, ONE_STANDFIRST, priceLabel, SOCRIA_ONE } from '@/lib/socria-one';
import { INERT, ONE, SiteFoot, SiteMast, SitePage, START, navWithout } from './chrome';
import { MapEdges, type MapEdge } from './MapEdges';
import { OneJoin } from './OneJoin';

/** The list in the first card: what a month of thinking looks like. */
export const ONE_CONVERSATIONS: readonly { title: string; meta: string }[] = [
  { title: 'The press and the Reformation', meta: 'Today · 6 cards' },
  { title: 'Hire before launch?', meta: 'Yesterday · 4 cards' },
  { title: 'Accrued expenses, set 3', meta: 'Mon · 2 cards' },
  { title: 'Letter to the landlord', meta: 'Sun · 1 card' },
  { title: 'Annual pricing proposal', meta: 'Sat · 3 cards' },
  { title: 'Eisenstein, chapter 3', meta: 'Fri · 5 cards' },
  { title: 'Why the bridge resonated', meta: 'Thu · 4 cards' },
  { title: 'Reading: the Federalist, No. 10', meta: 'Wed · 3 cards' },
  { title: 'Should we raise now?', meta: 'Tue · 5 cards' },
  { title: 'Organic chemistry, mechanisms', meta: 'Mon · 2 cards' },
];

const EDGES: readonly MapEdge[] = [{ from: 'c', to: 'c2', on: true }];

function Plus() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M8 7l4-4 4 4" />
    </svg>
  );
}

export function One() {
  const price = priceLabel();
  return (
    <SitePage tone="one">
      <SiteMast links={navWithout(ONE.href)} go={<OneJoin place="mast" />} />

      <main className="s-sec s-o" aria-labelledby="s-o-h">
        <div className="s-o-in">
          <div className="s-o-top">
            <div className="s-o-say">
              <div className="s-o-eb">
                <OneMark size={44} tone="light" />
                <span>Socria One · MMXXVI</span>
              </div>
              <h1 id="s-o-h">
                {ONE_HEADLINE}{' '}
                <em>
                  {price} a {SOCRIA_ONE.period}.
                </em>
              </h1>
            </div>
            <div className="s-o-act">
              <p className="s-o-stand">{ONE_STANDFIRST}</p>
              <div className="s-o-go">
                <OneJoin place="cover" />
                <a className="s-o-free" href={START}>
                  Socria is free to start
                </a>
              </div>
            </div>
          </div>

          <div className="s-o-grid">
            <section className="s-o-card" aria-labelledby="s-o-c1">
              <div className="s-o-pic" aria-hidden="true" {...INERT}>
                <div className="s-o-bar">
                  <span className="s-o-bar-t">Conversations</span>
                  <span className="s-chip">
                    <Plus />
                    New
                  </span>
                </div>
                <div className="s-o-list">
                  {ONE_CONVERSATIONS.map((c) => (
                    <div className="s-o-row" key={c.title}>
                      <i />
                      <span className="s-o-row-t">{c.title}</span>
                      <span className="s-o-row-m">{c.meta}</span>
                    </div>
                  ))}
                </div>
                <div className="s-o-fade" />
              </div>
              <div className="s-o-cap">
                <h2 id="s-o-c1">Unlimited conversations</h2>
                <p>No daily or monthly count. Begin as many as you have.</p>
              </div>
            </section>

            <section className="s-o-card" aria-labelledby="s-o-c2">
              <div className="s-o-pic" aria-hidden="true" {...INERT}>
                <div className="s-o-bar">
                  <span className="s-o-bar-t">The press and the Reformation</span>
                  <span className="s-chip is-on">
                    <ShareIcon />
                    Share
                  </span>
                </div>
                <div className="s-o-canvas">
                  <MapEdges edges={EDGES} />
                  <div className="s-o-nodes">
                    <div className="s-o-n1" data-pn="c">
                      <LogosNode type="claim" label="The press caused the Reformation" status="revised" />
                    </div>
                    <div className="s-o-n2" data-pn="c2">
                      <LogosNode type="claim" label="It made it impossible to stop" status="resolved" state="lit" />
                    </div>
                    <div className="s-o-pop">
                      <span className="s-o-pop-k">Share this map</span>
                      <span className="s-o-pop-b">Anyone with the link can view.</span>
                      <span className="s-o-pop-url">socria.app/m/press</span>
                      <span className="s-o-pop-go">Copy link</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="s-o-cap">
                <h2 id="s-o-c2">Share every map</h2>
                <p>Send a conversation with its map. As many as you like.</p>
              </div>
            </section>
          </div>
        </div>
      </main>
      <SiteFoot middle="Renews monthly · Cancel any time" />
    </SitePage>
  );
}
