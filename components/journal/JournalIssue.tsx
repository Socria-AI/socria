'use client';
// components/journal/JournalIssue.tsx
//
// Socria — Issue No. 4 · the homepage.
//
// Short, on purpose, and exactly as long as the design's Copy 11: the door
// (the product's own composer as the cover), the stage that shows it working,
// what it is, where it differs, one question about what it is worth, and the
// close. The eight-question interrogation and its four readings were cut in
// the design, and this follows it rather than keeping them below the fold —
// the argument is made by the stage now, not by the essay after it.
//
// Ported from the Claude Design prototype's journal-issue.jsx. The structure
// and the words are the design's; the links point at real routes instead of
// flat .html files, Logos 3 is named where the issue names the product,
// and the price is read from the one place it lives.
//
// A CLIENT COMPONENT, because drivers.ts does direct DOM work — splitting
// headlines into per-word spans, scrubbing an SVG against scroll. The page is
// stateless after mount, so React never re-renders the nodes it rewrites.
// Adding state that re-renders a section would undo the word-splitting inside
// it; if this page ever needs state, isolate it below the sections that get
// split.

import { useEffect } from 'react';
import { Colophon } from '@/components/Colophon';
import { priceLabel } from '@/lib/socria-one';
import { Grain, Progress, Count, Mast, Door, AskSlip, Turn, PrintLink, Label } from './parts';
import { Button, Logo, DefinitionEntry, ContrastPair } from './ds';
import { Stage } from './Stage';
import { initJournal } from './drivers';

export function JournalIssue() {
  useEffect(() => {
    return initJournal();
  }, []);

  return (
    <div className="jr-root">
      <Grain />
      <Progress />
      <Count />
      <AskSlip />
      <Mast current="journal" cta={{ href: '/chat', t: 'Try Socria' }} />

      {/* THE DOOR — the composer is the cover. The headline it displaces
          closes the issue, which is where it was always going. */}
      <Door issue="Issue No. 4 · Logos 3 · MMXXVI" />

      {/* THE ANCHOR THE DOOR POINTS AT. "Or watch it work first" is the one
          way past the composer for somebody not ready to type, and it was a
          link to nothing: the id lives on the design's own `<span id="stage">`
          immediately before the Stage, and I ported the link without it. A
          dead anchor does not fail — the page simply does not move, which
          reads as the link being broken on purpose. */}
      <span id="stage" />
      <Stage />

      {/* WHAT IT IS — one screen, after the stage. Shorter than a spread,
          because a definition that needs a full screen is an argument wearing
          a definition's clothes. */}
      <section className="about" id="about" data-screen-label="What it is">
        <div className="wrap">
          <Label tone="moss">What it is</Label>
          <DefinitionEntry
            word="Socria"
            pos="noun · human-first AI"
            gloss={
              <>
                A reasoning environment built so the part worth keeping stays yours. It does the
                research, the calculation and the critique in full, surfaces the assumptions under
                what you said and names the tensions you have not resolved — but{' '}
                <em>never hands you the conclusion.</em>
              </>
            }
            coda={
              <>
                It doesn&rsquo;t think for you.
                <br />
                <em>It helps you think more clearly.</em>
              </>
            }
          />
        </div>
      </section>

      {/* WHERE IT DIFFERS — a category distinction, not a comparison table.
          No grid of ticks and no competitor column: the pair carries the
          argument, and the prose is generous about the alternatives because
          the position is about the trade rather than about the tools. */}
      <section className="differs" id="differs" data-screen-label="Where it differs">
        <div className="wrap">
          <Label tone="moss">Where it differs</Label>
          <h2 className="rv">
            Not a better answer. <span className="em">A different question.</span>
          </h2>
          <div className="rv d1 pair-holder">
            <ContrastPair
              theirLabel="What most assistants are built to ask"
              theirQuestion="How good an answer can we give you?"
              ourLabel="What Socria is built to ask"
              ourQuestion="How much clearer can your own thinking get?"
            />
          </div>
          <div className="cols rv d2">
            <p>
              Claude, ChatGPT and Gemini are very good at the thing they are built for — finding
              you the best available answer, fast, across almost any subject. Most of the time that
              is exactly what you want, and this is not an argument against it.
            </p>
            <p>
              Logos 3 does that work too — the research, the calculation, the verification, the
              critique — <em>in full.</em> What it holds back is the one step that would have made
              you more capable for having taken it: the conclusion. And it builds the rest beside
              you — a map of your reasoning, a model you can move, a design you can turn — so that
              step is yours to take with the structure in view.
            </p>
          </div>
          <p className="differs-close rv d2">
            We are not against the machine. <span className="em">Only against the trade.</span>
          </p>
        </div>
      </section>

      <Turn
        i="i"
        who="Socria asks"
        socria
        answer={
          <>
            Nothing, to begin — the free tier is a beginning rather than a demonstration, and
            everything you watched above is in it. Socria One is {priceLabel()} a month and removes
            the ceiling. The vow holds at either tier: <em>what you have made is yours.</em>
          </>
        }
      >
        What is it worth to you?
      </Turn>

      {/* THE CLOSE */}
      <section className="close" data-screen-label="Close">
        <div className="glow" aria-hidden="true" />
        <div className="wrap">
          <div className="rv" style={{ marginBottom: '28px' }}>
            <Logo size="lg" showWordmark={false} onDark markSrc="/socria-mark.png" />
          </div>
          {/* THE HEADLINE THE DOOR DISPLACED, where it was always going.
              It opened the issue when a cover opened it; with the composer as
              the cover, the argument is better made after somebody has watched
              the thing refuse to answer than before. And it unsays a
              duplication: the close read "Think For Yourself." directly above
              a colophon that says the same words. */}
          <h2 data-split="">
            <span className="b">AI gets stronger.</span>
            <span className="b em">Humans should too.</span>
          </h2>
          <p className="coda rv d2">
            Which is the whole argument. Bring the question you have been carrying — it will not
            answer it, and that is the point.
          </p>
          <p className="said rv d2">
            <span data-readtime="">under a minute</span>, and I never gave you an answer.{' '}
            <em>Good.</em>
          </p>
          {/* THE TWO WAYS ON, in the design's own words. "Open Core 4" names
              the engine to somebody who has just been told what Core 4 is and
              may not yet want it by name; "Try Socria — free" says what it
              costs, which is the question anybody who has read this far is
              actually holding. The second goes to Logos rather than to One —
              the issue has already made the argument, and the next thing to
              read about is the environment, not the price. */}
          <div className="row rv d2">
            <Button as="a" href="/chat" variant="primary" size="xl" onDark arrow>
              Try Socria — free
            </Button>
            <Button as="a" href="/logos" variant="link" onDark>
              or read on about Logos
            </Button>
          </div>

          {/* The colophon carries the whole site, including the legal pages.
              `subprocessors` was previously reachable only by typing its URL —
              a page nobody could find is not a published policy. */}
          <Colophon className="colophon">
            <span>
              <PrintLink />
            </span>
          </Colophon>
        </div>
      </section>
    </div>
  );
}
