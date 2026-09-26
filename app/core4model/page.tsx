// app/core4model/page.tsx — Core 4, as an object you can turn.
//
// The page is the model plus the argument for it. The model alone shows the
// SHAPE of a turn and cannot show why the shape is that one, and the reason is
// the whole point: a system prompt cannot hold a line it wants to cross, so the
// line is held outside the model that would cross it. So the prose below is not
// a caption — it is the half of the page that says what the moving part means.
//
// Everything here is checked against lib/core4/ rather than against the older
// docs/CORE-4-ARCHITECTURE.md, which has drifted (it still describes a module
// that was deleted and a prompt version two behind).

import type { Metadata } from 'next';
import Link from 'next/link';
import { Core4Model } from './Core4Model';
import './core4model.css';

export const metadata: Metadata = {
  title: 'Core 4, as a model you can turn — Socria',
  description:
    'One Core 4 turn as a three-dimensional object: six stages a reply falls through, the eight-dimension split, the single door every move leaves by, and the guard that sends a draft back. Drag to turn it.',
  openGraph: {
    title: 'Core 4, as a model you can turn',
    description:
      'Six stages a reply falls through, the eight-dimension split, and the guard that sends a draft back to be written again.',
  },
};

export default function Core4ModelPage() {
  return (
    <div className="c4m-root">
      <header className="c4m-top">
        <p className="c4m-kicker">Socria · Core 4 · the architecture</p>
        <h1>
          A reply falls through <em>six gates</em> before anyone reads it
        </h1>
        <p className="c4m-lede">
          Core 4 is not a prompt. It is a pipeline with the decisions taken out of the
          model and put into code — and the object below is that pipeline, to scale, in
          the order a turn actually passes through it. Drag it to turn it. The moving
          point is one reply.
        </p>
      </header>

      <Core4Model />

      <div className="c4m-read">
        <hr className="c4m-rule" />

        <h2>The question the whole thing answers</h2>
        <p>
          A frontier model wants to be helpful. Told <em>&ldquo;write me a story &mdash; just
          write one&rdquo;</em>, it will write one. So the design question is narrow and
          uncomfortable:{' '}
          <strong>
            if the model writing the reply actively wants to comply, what outside that
            model stops it?
          </strong>{' '}
          If the answer is &ldquo;a stronger prompt&rdquo;, nothing has been built.
        </p>
        <p>
          Everything in the model above is an answer to that. The decisions happen before
          the reply model is called, in code it cannot reach, and the last of them happens
          after the draft exists and before anyone has seen it.
        </p>

        <h2>Three tiers, and only one of them decides</h2>
        <div className="c4m-grid">
          <div className="c4m-card" data-by="pure">
            <h4>Deterministic code</h4>
            <p>
              Reads their explicit words, merges the state, splits the cognition,
              allocates, prices the questions, chooses the move, guards the draft. Every
              decision on the turn is here.
            </p>
          </div>
          <div className="c4m-card" data-by="cheap">
            <h4>A cheap model, reading</h4>
            <p>
              Reads the transcript, checks their arithmetic, re-derives a conclusion
              without one of its premises. It reports evidence. It cannot mark anything
              explicit and cannot decide anything.
            </p>
          </div>
          <div className="c4m-card" data-by="front">
            <h4>The frontier model, writing</h4>
            <p>
              Writes the reply and holds no authority. Every constraint on it &mdash; what
              is reserved, what is withheld, how many questions are allowed, the register
              &mdash; was settled in the tier above before it was called.
            </p>
          </div>
        </div>

        <h2>The split is eight decisions, not one</h2>
        <p>
          A gate has to answer &ldquo;should Socria do this?&rdquo;, and for almost every
          real message the honest answer is <em>most of it, yes</em>. &ldquo;Solve this
          integral for the pricing model&rdquo; wants the algebra done, the method named,
          the result checked &mdash; and the modelling judgement left alone. One verdict
          over a whole turn has to choose between being useless and being a substitute.
        </p>
        <p>
          So the reasoning is split eight ways and each part gets its own answer:{' '}
          <strong>perform</strong> it whole, <strong>share</strong> it in the open,{' '}
          <strong>scaffold</strong> it so they take the step, or leave it{' '}
          <strong>to them</strong> and supply it in no wording at all. Retrieval,
          representation, verification and mechanical work are Socria&rsquo;s by
          construction &mdash; there is no version of &ldquo;I did your retrieval for
          you&rdquo; that diminishes anybody. Reasoning, metacognition, judgement and
          creativity are where the invariant lives.
        </p>

        <h2>Four things hold the line, and none of them is a prompt</h2>
        <div className="c4m-grid">
          <div className="c4m-card" data-by="human">
            <h4>One · it is reserved</h4>
            <p>
              Before any text exists, the dimension is marked as theirs &mdash; and it
              stays marked. Asking harder does not move it; the split is carried forward
              rather than re-derived from the last four words.
            </p>
          </div>
          <div className="c4m-card" data-by="stop">
            <h4>Two · one door</h4>
            <p>
              Every one of the dozens of paths that picks a move leaves through the same
              function, which writes the constraint into what the model reads. There is no
              route that forgets, because there is no route that skips it.
            </p>
          </div>
          <div className="c4m-card" data-by="front">
            <h4>Three · nothing is un-sendable</h4>
            <p>
              When anything is reserved, the whole draft is buffered. The person has seen
              nothing, so a bad draft can still be refused &mdash; a streamed one could
              only be apologised for.
            </p>
          </div>
          <div className="c4m-card" data-by="stop">
            <h4>Four · the last door shuts</h4>
            <p>
              A rejected draft gets one regeneration, and the retry is checked as hard as
              the first. If it fails too, the reply is built in code rather than shipped.
              That door used to be open, which is what made the other three worth nothing.
            </p>
          </div>
        </div>

        <h2>And the other rail</h2>
        <p>
          Preservation without augmentation is under-help, and it is a failure of the same
          invariant. A version of this that only held things back would be the cheapest
          thing to implement and the least valuable &mdash; and an earlier one did exactly
          that: a wrong attempt meant the correction was withheld, debugging meant a hint
          instead of the fix, an open request meant a question. Human-first had quietly
          become &ldquo;do not answer&rdquo;.
        </p>
        <p>
          So the guard looks both ways. It removes a reply that performs work the person
          wanted to do, and it also removes one that asks beyond the budget, deflects to
          &ldquo;it depends on your goals&rdquo;, or offers a hint to somebody who said{' '}
          <em>just tell me</em>. Socria performs the work by default; anything held back
          needs their own words, quoted, and one of five named reasons.
        </p>

        <h2>What is honestly still weak</h2>
        <p>
          The novelty matcher is lexical, with roughly a tenth of the recall on paraphrase
          that it would need &mdash; so &ldquo;already considered&rdquo; is closer to
          decorative than its name suggests. And across six evaluation runs Core 4 reached
          parity on control and never got past parity on contribution: it reliably stops
          doing the things a good prompt does wrong, and it has not yet been shown to say
          more that is worth hearing. Whether the structure it holds across turns can
          produce insight a prompt cannot is the open question, not a settled one.
        </p>

        <p style={{ marginTop: '2.2rem' }}>
          <Link href="/chat?model=core-4">Open Core 4 &rarr;</Link>
        </p>
      </div>
    </div>
  );
}
