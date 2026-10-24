// components/site/Landing.tsx — the homepage, from `Socria Landing` in the
// design project: the cover with Logos 5 framed under it, one conversation
// with the cards it drew in the margin, three things people bring, the plans,
// and the close.
//
// A server component. The only parts that run in the browser are the map's
// edges (measured from where the cards land) and the three demos, which play
// once each is on screen.
//
// The product pictures are pictures: the Logos 5 shell and the cards in it
// are inert — nothing to tab to, nothing that pretends to be a control —
// and the shell is one labelled figure to a screen reader. The conversation
// beside it is real text; the cards repeat it.

import { Button, LogosNode, SpreadHead } from '@/components/ds';
import { priceLabel, SOCRIA_ONE } from '@/lib/socria-one';
import { CHARTER, DOCS, ONE, PRIVACY, SiteFoot, SiteMast, SitePage, START, TERMS } from './chrome';
import { Ico } from './icons';
import { MapEdges, type MapEdge } from './MapEdges';
import { UseCase, type UseCaseProps } from './UseCase';

const INERT = { inert: '' } as Record<string, string>;

const EDGES: MapEdge[] = [
  { from: 'c1', to: 'a' },
  { from: 'c1', to: 'q', on: true },
  { from: 'q', to: 'cp' },
  { from: 'q', to: 's' },
  { from: 'cp', to: 'c2', on: true },
  { from: 's', to: 'c2', on: true },
];

const USES: (UseCaseProps & { id: string })[] = [
  {
    id: 'school',
    n: 'i.',
    kind: 'A problem set · Accounting 201',
    wide: true,
    mapped: 2,
    steps: [
      { at: 100, kind: 'you', text: 'For 3b I got $4,200 in accrued expenses. Is that right?' },
      { at: 900, until: 2100, kind: 'thinking' },
      { at: 2100, kind: 'socria', text: 'Before I check: which entry did you adjust first, and why that one?' },
      { at: 3400, kind: 'you', text: 'Wages. They’re owed but not paid yet.' },
      { at: 4200, until: 5400, kind: 'thinking' },
      { at: 5400, kind: 'socria', text: 'Right. Now put the $4,200 through the same test. What in it is owed but not paid?' },
      {
        at: 6400,
        kind: 'cards',
        cards: [
          { type: 'concept', label: 'Accrue what is owed but not paid', status: 'resolved' },
          { type: 'given', label: 'Accrued expenses · $4,200', status: 'open' },
        ],
      },
    ],
    caption: 'Socria checks the rule you used before it checks your number. The second time you meet an accrual, you won’t need to ask.',
  },
  {
    id: 'work',
    n: 'ii.',
    kind: 'A proposal · Work',
    mapped: 1,
    steps: [
      { at: 100, kind: 'you', text: 'Draft: we’re moving to annual pricing because churn is too high.' },
      { at: 900, until: 2100, kind: 'thinking' },
      { at: 2100, kind: 'socria', text: 'Too high compared with what? And does annual lower churn, or delay the month you see it?' },
      { at: 3100, kind: 'cards', cards: [{ type: 'assumption', label: 'Annual pricing lowers churn', status: 'open' }] },
    ],
    caption: 'The assumption under the plan, while it is still cheap to change.',
  },
  {
    id: 'home',
    n: 'iii.',
    kind: 'A letter · Home',
    mapped: 1,
    steps: [
      { at: 100, kind: 'you', text: 'I need to tell my landlord the heating has been broken for three weeks.' },
      { at: 900, until: 1900, kind: 'thinking' },
      { at: 1900, kind: 'socria', text: 'What do you want to have happened by Friday: an apology, a repair date, or money back?' },
      { at: 2700, kind: 'cards', cards: [{ type: 'goal', label: 'A repair date, in writing, by Friday', status: 'open' }] },
    ],
    caption: 'What you are actually trying to say, found by being asked.',
  },
];

/** The landing's cover picture: Logos 5 with the Logic Map open and the conversation beside it. */
function Shot() {
  return (
    <figure className="s-shot" aria-label="Logos 5: a Logic Map of an essay on the printing press and the Reformation, with the conversation that drew it beside it">
      <div className="s-app" aria-hidden="true" {...INERT}>
        <div className="s-app-top">
          <div className="s-app-l">
            <span className="s-chip is-back">
              <Ico name="back" size={16} />
              Universal Map
            </span>
            <span className="s-app-title">Essay 2 · The press and the Reformation</span>
            <span className="s-ib">
              <Ico name="plus" />
            </span>
          </div>
          <div className="s-app-c">
            <span className="s-find">
              <Ico name="search" />
              <span className="s-find-t">Search conversations, content, artifacts…</span>
              <kbd>⌘K</kbd>
            </span>
          </div>
          <div className="s-app-r">
            <span className="s-chip is-on">
              <Ico name="split" stroke={1.7} />
              <span>Split View</span>
            </span>
            <span className="s-ib">
              <Ico name="network" />
            </span>
            <span className="s-ib">
              <Ico name="more" size={18} />
            </span>
            <span className="s-avatar">A</span>
          </div>
        </div>
        <div className="s-app-tabs">
          <div className="s-tabrow">
            <span className="s-tab">
              Chat<span className="s-count">4</span>
            </span>
            <span className="s-tab">
              Content<span className="s-count">1</span>
            </span>
            <span className="s-tab">Artifacts</span>
            <span className="s-tab is-on">
              Logic Map<span className="s-count">6</span>
            </span>
          </div>
          <span className="s-chip">Synthesize</span>
        </div>
        <div className="s-app-body">
          <div className="s-canvas">
            <MapEdges edges={EDGES} />
            <div className="s-cards">
              <div className="s-card is-c1" data-pn="c1">
                <LogosNode type="claim" label="The printing press caused the Reformation" status="revised" />
              </div>
              <div className="s-card is-a" data-pn="a">
                <LogosNode type="assumption" label="Nothing like it was spreading before the press" status="open" />
              </div>
              <div className="s-card is-q" data-pn="q">
                <LogosNode type="question" label="Caused it, or made it hard to contain?" status="resolved" />
              </div>
              <div className="s-card is-cp" data-pn="cp">
                <LogosNode type="counterpoint" label="Hus, a century earlier, with no press" status="supported" />
              </div>
              <div className="s-card is-s" data-pn="s">
                <LogosNode type="source" label="Eisenstein, ch. 3 · print runs after 1517" status="supported" />
              </div>
              <div className="s-card is-c2" data-pn="c2">
                <LogosNode type="claim" label="The press didn’t start it. It made it impossible to stop." status="resolved" state="lit" />
              </div>
            </div>
          </div>
          <div className="s-beside">
            <div className="s-beside-head">
              <span>Chat</span>
              <span className="s-ib">
                <Ico name="close" />
              </span>
            </div>
            <div className="s-thread">
              <div className="s-you">
                <p>My thesis: the printing press caused the Reformation.</p>
              </div>
              <div className="s-ai">
                <p>
                  Caused it, or made it impossible to contain? Luther’s theses crossed Germany in weeks because of the
                  press. But something had to be worth printing first.{' '}
                  <em>What was already moving before 1517 that the press didn’t start?</em>
                </p>
                <div className="s-mapped">
                  <span>
                    <Ico name="map" stroke={1.7} />
                    +3 on the map
                  </span>
                </div>
              </div>
              <div className="s-you">
                <p>Hus and Wycliffe, a century earlier. But those stayed local.</p>
              </div>
              <div className="s-ai">
                <p>
                  Stayed local, or were kept local? Hus was burned in 1415, and his movement held Bohemia for a century
                  without a press.{' '}
                  <em>So what did the press change: whether the idea spread, or how fast it could be put down?</em>
                </p>
                <div className="s-mapped">
                  <span>
                    <Ico name="map" stroke={1.7} />
                    +3 on the map
                  </span>
                </div>
                <div className="s-acts">
                  <span>
                    <Ico name="copy" stroke={1.7} />
                    Copy
                  </span>
                  <span>
                    <Ico name="retry" stroke={1.7} />
                    Retry
                  </span>
                </div>
              </div>
            </div>
            <div className="s-omni-wrap">
              <div className="s-omni">
                <div className="s-omni-row">
                  <span className="s-omni-clip">
                    <Ico name="clip" size={18} stroke={1.7} />
                  </span>
                  <span className="s-omni-ph">Ask, or point at something and ask</span>
                </div>
                <div className="s-omni-row">
                  <span className="s-omni-depth">
                    Thoughtful <Ico name="down" size={10} stroke={2} />
                  </span>
                  <span className="s-send">
                    <Ico name="send" size={16} stroke={1.9} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="s-caption">Logos 5 · the Logic Map, with the conversation beside it</figcaption>
    </figure>
  );
}

/** One exchange of the sample conversation, and the cards it put on the map. */
function Exchange({
  you,
  socria,
  cards,
}: {
  you: string;
  socria: string;
  cards: React.ComponentProps<typeof LogosNode>[];
}) {
  return (
    <>
      <div className="s-turns">
        <div className="s-turn">
          <span className="s-who">You</span>
          <p>{you}</p>
        </div>
        <div className="s-turn is-socria">
          <span className="s-who">Socria</span>
          <p>{socria}</p>
        </div>
      </div>
      <div className="s-margin" {...INERT}>
        {cards.map((c) => (
          <LogosNode key={c.label} {...c} />
        ))}
      </div>
    </>
  );
}

export function Landing() {
  return (
    <SitePage>
      <SiteMast
        links={[{ href: '#session', label: 'A conversation' }, ONE, CHARTER]}
        go={
          <Button as="a" href={START} variant="primary" size="md">
            Start a conversation
          </Button>
        }
      />

      <main>
        <section className="s-sec s-cover" aria-labelledby="s-cover-h">
          <div className="s-cover-in">
            <div className="s-cover-top">
              <h1 id="s-cover-h">
                Come out <em>sharper.</em>
              </h1>
              <div className="s-cover-side">
                <p className="s-stand">
                  Socria is built to make the person using it stronger. Bring an essay, a problem set, a decision or a
                  page you don’t understand yet. It still answers, but it asks first, so the next one needs less help
                  than this one.
                </p>
                <div className="s-go">
                  <Button as="a" href={START} variant="primary" size="xl" arrow>
                    Start a conversation
                  </Button>
                  <span className="s-go-note">Free to start.</span>
                </div>
              </div>
            </div>
            <Shot />
          </div>
        </section>

        <section className="s-sec s-band" id="session" aria-label="One conversation">
          <div className="s-wrap s-band-in">
            <div className="s-band-head">
              <SpreadHead num="I." name="One conversation" />
              <h2 className="s-display">
                Four turns. The cards in the margin are what Socria wrote on the map as it went.
              </h2>
            </div>
            <div className="s-session">
              <div className="s-session-rule">
                <span>A sample conversation · Launch</span>
                <i aria-hidden="true" />
                <span>Logos 5</span>
              </div>
              <Exchange
                you="I think we should hire a second engineer before the launch."
                socria="Before the hire, one thing. You’re assuming the launch holds for March. If it slips, the new engineer spends their first two months onboarding into a team that is still finding its footing. What happens to the hire if March moves?"
                cards={[
                  { type: 'decision', label: 'Hire a second engineer before launch', status: 'open' },
                  { type: 'assumption', label: 'The launch holds for March', status: 'open' },
                ]}
              />
              <Exchange
                you="The date is fixed. The conference is March 12."
                socria="Then the hire is a bet on onboarding speed, not on the date. The second engineer lands after launch either way. What does the first engineer stop doing in the meantime?"
                cards={[
                  { type: 'constraint', label: 'The conference is March 12', status: 'supported' },
                  { type: 'question', label: 'What does the first engineer stop doing?', status: 'open' },
                ]}
              />
            </div>
            <div className="s-band-close">
              <p>Four cards, two questions. The decision is still yours, and it is a better one than the one you walked in with.</p>
              <Button as="a" href={START} variant="line" size="lg" arrow>
                Bring your own
              </Button>
            </div>
          </div>
        </section>

        <section className="s-sec s-band" aria-label="What people bring">
          <div className="s-wrap s-uses-in">
            <div className="s-uses-head">
              <div className="s-band-head">
                <SpreadHead num="II." name="What people bring" />
                <h2 className="s-display">Anything you bring, you leave better at.</h2>
              </div>
              <p>
                A chapter you have to know by Thursday, a proposal due Monday, a letter you keep not writing. Socria
                reads what you give it and asks the question you skipped.
              </p>
            </div>
            <div className="s-uses">
              {USES.map(({ id, ...u }) => (
                <UseCase key={id} {...u} />
              ))}
            </div>
          </div>
        </section>

        <section className="s-sec s-plans-sec" aria-label="Plans">
          <div className="s-wrap s-plans-in">
            <SpreadHead num="III." name="Plans" />
            <div className="s-plans">
              <div className="s-plan">
                <h3>Free</h3>
                <p>Free to start, with a free account. Bring a document and watch the map fill in.</p>
                <div className="s-plan-go">
                  <Button as="a" href={START} variant="primary" size="md" arrow>
                    Start a conversation
                  </Button>
                </div>
              </div>
              <div className="s-plan">
                <h3>
                  Socria One{' '}
                  <span>
                    · {priceLabel()} a {SOCRIA_ONE.period}
                  </span>
                </h3>
                <p>
                  No daily count. Lines of thinking as you need them, longer documents, and personalisation that learns
                  how you reason.
                </p>
                <div className="s-plan-go">
                  <Button as="a" href={ONE.href} variant="link" arrow>
                    See Socria One
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="s-sec s-close-sec" aria-label="The close">
          <div className="s-wrap s-close-in">
            <p className="s-close">
              The next one will need <em>less help.</em>
            </p>
            <SiteFoot
              middle={<span>Logos 5 · MMXXVI</span>}
              links={[
                CHARTER,
                ONE,
                DOCS,
                PRIVACY,
                TERMS,
                { href: 'https://www.linkedin.com/company/socria', label: 'LinkedIn' },
                { href: 'https://www.instagram.com/socriaai', label: '@socriaai' },
              ]}
            />
          </div>
        </section>
      </main>
    </SitePage>
  );
}
