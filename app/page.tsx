// app/page.tsx — Socria homepage: "The Socria Journal", an editorial magazine.
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  SignedIn,
  SignedOut,
  UserButton,
  ClerkLoading,
  ClerkLoaded,
} from '@clerk/nextjs';
import { MagazineMotion } from '@/components/MagazineMotion';
import { listPosts, getFeaturedPost } from '@/sanity/lib/queries';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Socria — a journal for thinking for yourself',
  description:
    'Socria is a human-first AI that asks before it answers, so your thinking stays yours. Issue No. 4 — Logos, the reasoning environment.',
};

function issueDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// In This Issue — the Logos dispatches. Each line is a shipped behavior of
// the reasoning environment, phrased for the cover, not a promise.
const DISPATCHES = [
  {
    rn: 'i.',
    h: 'Watch your thinking take shape',
    p: 'Talk, and a live Thinking Map draws the structure of what you say beside the conversation — your claims, assumptions, tensions and evidence, reorganizing as your mind does.',
  },
  {
    rn: 'ii.',
    h: 'Press on any thought',
    p: 'Click a node and choose the move: Explore it, Challenge it, take it out to real research with sources, or Trace it back to the moment you said it — in your own words, verbatim.',
  },
  {
    rn: 'iii.',
    h: 'Mathematics, done honestly',
    p: 'Work a problem and the map becomes the working — a hand-drawn Board where mistakes are struck through and repaired, never erased. While you’re learning, the answer stays yours to reach.',
  },
  {
    rn: 'iv.',
    h: 'Write beside your reasoning',
    p: 'Draft Space is a page of your own with the map alongside, lighting the thinking each paragraph rests on. Logos reads and responds — it never writes your words for you.',
  },
];

export default async function Home() {
  const year = new Date().getFullYear();
  const [featured, allPosts] = await Promise.all([getFeaturedPost(), listPosts()]);
  const feature = featured ?? allPosts[0] ?? null;
  const list = allPosts.filter((p) => !feature || p._id !== feature._id).slice(0, 3);

  return (
    <div className="mag-root">
      <div className="progress" aria-hidden="true" />

      <div className="spine" aria-hidden="true">
        <span className="ink" />
        <span className="folio" id="folio">
          Cover
        </span>
      </div>

      <header className="masthead" id="masthead">
        <div className="mh-left">
          <img src="/socria-logo.png" alt="" />
          <span className="name">Socria</span>
        </div>
        <div className="mh-center label">A place for thinking for yourself</div>
        <div className="mh-right">
          <Link href="/logos">Logos</Link>
          <Link href="/one">Socria One</Link>
          {/* Sign-in must survive Clerk being slow or misconfigured in
              production: show a real /sign-in link during load and when
              signed out, and only swap to the avatar once Clerk confirms a
              session. If Clerk never initializes, the link still shows. */}
          <ClerkLoading>
            <Link href="/sign-in" className="signin">
              Sign in
            </Link>
          </ClerkLoading>
          <ClerkLoaded>
            <SignedOut>
              <Link href="/sign-in" className="signin">
                Sign in
              </Link>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/" userProfileMode="navigation" userProfileUrl="/account" />
            </SignedIn>
          </ClerkLoaded>
          <Link href="/chat" className="ask">
            Ask Socria
          </Link>
        </div>
      </header>

      <main id="top">
        {/* COVER */}
        <section className="spread cover" data-folio="Cover" data-screen-label="Cover">
          <div className="issue label moss">Issue No. 4 · Logos · MMXXVI</div>
          <h1 className="q" data-text="When did you last change your mind?">
            When did you last{' '}
            <span className="ink-mark ink-circ em" id="cover-mark">
              change your mind?
              <svg viewBox="0 0 100 42" preserveAspectRatio="none">
                <path d="M8,21 C6,9 30,4 52,5 C79,6 96,11 95,22 C94,34 69,39 45,38 C23,37 7,32 9,23" />
              </svg>
            </span>
          </h1>
          <p className="standfirst fade d1">
            Socria is a human-first AI that asks before it answers, so your
            thinking stays yours.
          </p>
          <div className="cover-cta fade d2">
            <Link className="cta-primary" href="/chat">
              Bring Socria a question <span className="ar">→</span>
            </Link>
            <a className="cta-secondary" href="#argument">
              or read the argument
            </a>
          </div>
          <a className="begin" id="begin" href="#argument" aria-label="Scroll to read">
            <span className="lbl">Scroll</span>
            <span className="ln" />
          </a>
        </section>

        {/* I · ARGUMENT */}
        <section className="spread argument" id="argument" data-folio="I" data-screen-label="The Argument">
          <div className="wrap narrow">
            <div className="spread-head">
              <span className="num">I.</span>
              <span className="label">The Argument</span>
            </div>
            <p className="opener" data-split>
              We were promised tools to think <span className="em">with.</span> We
              built machines to think <span className="em">for us</span> instead.
            </p>
            <div className="body">
              <p>
                <span className="drop">S</span>omewhere along the way, asking
                quietly became answering. We stopped forming arguments and started{' '}
                <em>generating</em> them. We stopped understanding ideas and started{' '}
                <em>producing</em> them. We stopped reasoning through decisions and
                began <em>outsourcing</em> them.
              </p>
              <p>
                The convenience is real, and the tools are genuinely powerful. But
                there is one thing no model can hold for you — your own judgment.
                Like anything worth keeping, it stays sharp by being <em>used.</em>
              </p>
            </div>
          </div>
          <div className="marginalia" id="mg-1">
            <svg viewBox="0 0 46 30">
              <path d="M44,5 C31,3 12,7 4,22 M4,22 L11,15 M4,22 L13,24" />
            </svg>
            be honest — when was the last time?
          </div>
        </section>

        {/* II · PULL QUOTE (dark) */}
        <section className="spread pull" data-folio="II" data-screen-label="The Risk">
          <div className="glow" aria-hidden="true" />
          <blockquote className="fade">
            The greatest risk of artificial intelligence was never the
            intelligence. It was the{' '}
            <span className="ink-mark ink-u sage em" id="pull-mark">
              artificial thinking.
              <svg viewBox="0 0 100 10" preserveAspectRatio="none">
                <path d="M1,5 C24,2 48,8 68,4 C82,2 93,5 99,4" />
              </svg>
            </span>
          </blockquote>
          <div className="attrib label fade" style={{ color: 'rgba(244,241,232,.5)' }}>
            — The case for Socria
          </div>
        </section>

        {/* III · DEFINITION */}
        <section className="spread def" id="what" data-folio="III" data-screen-label="The Idea">
          <div className="wrap">
            <div className="spread-head">
              <span className="num">III.</span>
              <span className="label">The Idea</span>
            </div>
            <div className="entry">
              <div className="term">
                <span className="w">Socria</span>
                <span className="ph">/ˈsoʊ.kri.ə/</span>
                <span className="pos">noun</span>
              </div>
              <p className="gloss fade">
                A human-first AI that strengthens your thinking instead of
                replacing it. It asks questions, surfaces assumptions, and reflects
                your reasoning back to you — but{' '}
                <em>never hands you the conclusion.</em> The clarity is always
                yours.
              </p>
              <p className="coda fade d1">
                It doesn&rsquo;t think for you.
                <br />
                <span className="b">It helps you think more clearly.</span>
              </p>
            </div>
          </div>
        </section>

        {/* IV · THE REFRAME (pinned) */}
        <section className="spread pin-reframe" id="reframe" data-folio="IV" data-screen-label="The Reframe">
          <div className="rf-stage">
            <div className="wrap">
              <div className="spread-head">
                <span className="num">IV.</span>
                <span className="label">The Reframe</span>
              </div>
              <p className="rf-prompt fade">
                Bring Socria a question, and it hands one back that cuts deeper.
                Watch —
              </p>
              <div className="rf-well">
                <div className="rf-pair on" data-i="0">
                  <p className="rf-shallow">
                    A founder: &ldquo;Is my growth strategy right?&rdquo;
                    <svg className="rf-strike" viewBox="0 0 100 12" preserveAspectRatio="none">
                      <path d="M1,7 C22,3 46,10 66,5 C80,2 92,7 99,5" />
                    </svg>
                  </p>
                  <p className="rf-deep">
                    What would have to be true for it to work — and which of those
                    are you assuming?
                  </p>
                </div>
                <div className="rf-pair" data-i="1">
                  <p className="rf-shallow">
                    A writer: &ldquo;Is the argument in my essay strong?&rdquo;
                    <svg className="rf-strike" viewBox="0 0 100 12" preserveAspectRatio="none">
                      <path d="M1,6 C22,9 46,3 66,7 C80,9 92,4 99,6" />
                    </svg>
                  </p>
                  <p className="rf-deep">
                    What are you really trying to convince your reader of — and do
                    you believe it yet?
                  </p>
                </div>
                <div className="rf-pair" data-i="2">
                  <p className="rf-shallow">
                    A student: &ldquo;I just don&rsquo;t get this concept.&rdquo;
                    <svg className="rf-strike" viewBox="0 0 100 12" preserveAspectRatio="none">
                      <path d="M1,7 C22,4 46,10 66,5 C80,3 92,8 99,5" />
                    </svg>
                  </p>
                  <p className="rf-deep">
                    Explain it as simply as you can — where does the explanation get
                    thin?
                  </p>
                </div>
              </div>
              <a className="rf-cue" href="#conversation">
                Now bring your own <span className="ar">↓</span>
              </a>
            </div>
          </div>
        </section>

        {/* V · CONVERSATION */}
        <section className="spread convo" id="conversation" data-folio="V" data-screen-label="A Conversation">
          <div className="wrap">
            <div className="spread-head">
              <span className="num">V.</span>
              <span className="label">A Conversation, Verbatim</span>
            </div>
            <p className="intro fade">
              The whole idea, in one exchange. Read it — then take a turn yourself.
            </p>
            <div className="transcript" id="transcript">
              <p className="dline you" data-say>
                <span className="who">The visitor</span>
                <span className="tx">
                  I got a job offer with more money. Should I take it?
                </span>
              </p>
              <p className="dline ai" data-say>
                <span className="who">Socria</span>
                <span className="tx">
                  Before the numbers — what made you open to leaving in the first
                  place?
                </span>
              </p>
              <p className="dline you" data-say>
                <span className="who">The visitor</span>
                <span className="tx">Honestly, I&rsquo;ve felt unchallenged lately.</span>
              </p>
              <p className="dline ai" data-say>
                <span className="who">Socria</span>
                <span className="tx">
                  Then the real question isn&rsquo;t the salary. Does this role
                  challenge you — or just pay you more to stay comfortable?
                </span>
              </p>
            </div>
            <div className="ask-row">
              <span className="pr">Your turn —</span>
              <input
                id="ask-input"
                type="text"
                placeholder="write what's actually on your mind"
                aria-label="Ask Socria"
              />
              <button id="ask-send">ask</button>
            </div>
            <div className="suggest">
              <button>Should I take the higher-paying job?</button>
              <button>Is my business strategy sound?</button>
              <button>Help me sharpen this argument.</button>
              <button>I can&rsquo;t grasp this concept.</button>
            </div>
            <div className="convo-real fade d1">
              <Link href="/chat" className="cta-secondary">
                Continue in the full Socria →
              </Link>
            </div>
          </div>
        </section>

        {/* VI · IN THIS ISSUE / LOGOS */}
        <section className="spread issue" id="logos" data-folio="VI" data-screen-label="In This Issue">
          <div className="wrap">
            <div className="spread-head">
              <span className="num">VI.</span>
              <span className="label">In This Issue</span>
            </div>
            <div className="well-head">
              <span className="label moss">Issue No. 4 — Socria Logos</span>
              <h2 data-split>The first AI that shows you your own reasoning.</h2>
              <p className="sf">
                Logos turns the conversation into an environment: your thinking,
                drawn live beside you — and still entirely yours.
              </p>
            </div>
            <div className="dispatches">
              {DISPATCHES.map((d, i) => (
                <div className={`dispatch fade${i % 2 ? ' d1' : ''}`} key={d.rn}>
                  <span className="rn">{d.rn}</span>
                  <h3>{d.h}</h3>
                  <p>{d.p}</p>
                </div>
              ))}
            </div>
            <p className="issue-more fade d2">
              <Link href="/logos">Read the Logos issue <span className="ar">→</span></Link>
            </p>
          </div>
        </section>

        {/* VII · CONTINUITY */}
        <section className="spread continuity" id="continuity" data-folio="VII" data-screen-label="Staying With It">
          <div className="wrap">
            <div className="spread-head">
              <span className="num">VII.</span>
              <span className="label">Staying With It</span>
            </div>
            <h2 data-split>
              A conversation doesn&rsquo;t have to end when you close the tab.
            </h2>
            <p className="cn-sub fade">
              The best thinking rarely finishes in one sitting. Socria keeps the
              thread — so you can leave, live a little, and come back to exactly
              where you were.
            </p>
            <div className="cn-list">
              <div className="cn-item fade">
                <span className="cn-n">→</span>
                <p>
                  Pick up an <em>unfinished line of thought</em> right where it
                  trailed off.
                </p>
              </div>
              <div className="cn-item fade d1">
                <span className="cn-n">→</span>
                <p>
                  Revisit a <em>contradiction</em> later, once you&rsquo;ve had time
                  to sit with it.
                </p>
              </div>
              <div className="cn-item fade d2">
                <span className="cn-n">→</span>
                <p>
                  Notice the <em>patterns</em> in how you reason, across many
                  conversations.
                </p>
              </div>
              <div className="cn-item fade d3">
                <span className="cn-n">→</span>
                <p>
                  Watch your understanding <em>build</em>, one return at a time.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* VIII · CREDO */}
        <section className="spread credo" id="beliefs" data-folio="VIII" data-screen-label="What We Hold">
          <div className="wrap">
            <div className="spread-head">
              <span className="num">VIII.</span>
              <span className="label">What We Hold</span>
            </div>
            <p className="lead" data-split>
              Five convictions behind every question Socria asks.
            </p>
            <ol>
              <li className="fade">
                <span className="n">01</span>
                <span className="t">Human thought stays central.</span>
              </li>
              <li className="fade">
                <span className="n">02</span>
                <span className="t">Questions over answers.</span>
              </li>
              <li className="fade">
                <span className="n">03</span>
                <span className="t">Understanding over output.</span>
              </li>
              <li className="fade">
                <span className="n">04</span>
                <span className="t">Reflection over reaction.</span>
              </li>
              <li className="fade">
                <span className="n">05</span>
                <span className="t">A partner, never a replacement.</span>
              </li>
            </ol>
          </div>
        </section>

        {/* IX · FURTHER READING — real Sanity posts */}
        <section className="spread reading short" id="journal" data-folio="IX" data-screen-label="Further Reading">
          <div className="wrap">
            <div className="rd-head">
              <div>
                <span className="label">IX · Further Reading</span>
                <h2>From the Socria journal.</h2>
              </div>
              <Link href="/blog">All writing →</Link>
            </div>

            {feature ? (
              <Link className="rd-feature fade" href={`/blog/${feature.slug}`}>
                <div className="art">
                  <span className="halo" />
                  <img src="/socria-logo.png" alt="" />
                </div>
                <div>
                  <span className="tag">
                    {feature.category?.name || 'Essay'}
                    {issueDate(feature.publishedAt) && ` · ${issueDate(feature.publishedAt)}`}
                  </span>
                  <h3>{feature.title}</h3>
                  {feature.excerpt && <p>{feature.excerpt}</p>}
                  <span className="more">Read the essay →</span>
                </div>
              </Link>
            ) : (
              <Link className="rd-feature fade" href="/blog">
                <div className="art">
                  <span className="halo" />
                  <img src="/socria-logo.png" alt="" />
                </div>
                <div>
                  <span className="tag">The Socria Journal</span>
                  <h3>Notes on thinking, coming soon.</h3>
                  <p>
                    Essays on reasoning, metacognition, and building an AI that
                    strengthens human judgment instead of replacing it.
                  </p>
                  <span className="more">Visit the journal →</span>
                </div>
              </Link>
            )}

            {list.length > 0 && (
              <div className="rd-list">
                {list.map((p, i) => (
                  <Link
                    key={p._id}
                    className={`rd-item fade${i ? ` d${i}` : ''}`}
                    href={`/blog/${p.slug}`}
                  >
                    <span className="tag">{p.category?.name || 'Essay'}</span>
                    <h4>{p.title}</h4>
                    {p.excerpt && <p>{p.excerpt}</p>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* · MIRROR */}
        <section className="spread mirror" data-folio="·" data-screen-label="Mirror">
          <div className="wrap narrow">
            <p className="mirror-line" data-split>
              You&rsquo;ve read this far and haven&rsquo;t been asked a single
              question. <span className="em">Socria would have asked by now.</span>
            </p>
          </div>
        </section>

        {/* Fin · CLOSE / COLOPHON */}
        <section className="spread close" id="start" data-folio="Fin" data-screen-label="Close">
          <div className="glow" aria-hidden="true" />
          <div className="inner wrap">
            <img className="mark fade" src="/socria-logo.png" alt="" />
            <h2 data-split>
              Think For <span className="em">Yourself.</span>
            </h2>
            <p className="invite fade d1">
              Bring an idea, question, or decision you haven&rsquo;t been able to
              settle. Leave with clearer thinking than you came with.
            </p>
            <Link href="/chat" className="cta fade d2">
              Begin a conversation <span className="arrow">→</span>
            </Link>
          </div>
          <div className="colophon">
            <span>Socria · Human-first AI</span>
            <div className="colo-socials">
              <a href="https://www.linkedin.com/company/socria" target="_blank" rel="noopener noreferrer" aria-label="Socria on LinkedIn">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9z" />
                </svg>
              </a>
              <a href="https://instagram.com/socriaai" target="_blank" rel="noopener noreferrer" aria-label="Socria on Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
                </svg>
              </a>
              <a href="https://tiktok.com/@socriaai" target="_blank" rel="noopener noreferrer" aria-label="Socria on TikTok">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16.5 3c.3 2.2 1.6 3.6 3.5 3.9v2.6c-1.3.1-2.5-.3-3.6-1v5.9c0 3.2-2.4 5.6-5.5 5.6A5.4 5.4 0 015.5 14c0-3.1 2.7-5.6 6-5.2v2.7c-.4-.1-.8-.2-1.2-.2-1.5 0-2.6 1.2-2.5 2.7 0 1.4 1.2 2.5 2.6 2.5 1.5 0 2.6-1.2 2.6-2.8V3z" />
                </svg>
              </a>
            </div>
            <span><Link href="/logos">Logos</Link></span>
            <span><Link href="/one">Socria One</Link></span>
            <span className="it">Think For Yourself.</span>
            <span>© {year}</span>
          </div>
        </section>
      </main>

      <Link href="/chat" className="ask-slip" id="ask-slip">
        <span className="dot" aria-hidden="true" />
        Ask Socria a question
      </Link>

      <MagazineMotion />
    </div>
  );
}
