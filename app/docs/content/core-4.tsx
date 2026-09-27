// Core 4 — the model that decides, per turn, which part of the work is
// yours. Checkable against CORE_4_PROMPT, lib/core4/* and the two long
// documents that specify it: docs/CORE-4-ARCHITECTURE.md (what each module
// does) and docs/CORE-4-EVALS.md (what was actually measured). Where this
// page states a number, it comes from the second one.

import Link from 'next/link';
import { Article, H2, Callout, Defs, Def } from '../Article';
import { docPage } from '../registry';

const page = docPage('core-4')!;
const sections = [
  { id: 'stance', heading: 'The stance' },
  { id: 'turn', heading: 'What happens on every turn' },
  { id: 'yours', heading: 'What stays yours, and when' },
  { id: 'remembers', heading: 'What it remembers, and whose it is' },
  { id: 'checking', heading: 'Checking the work' },
  { id: 'research', heading: 'When it looks something up' },
  { id: 'controls', heading: 'How you steer it' },
  { id: 'honest', heading: 'What it is not' },
];

export function Core4() {
  return (
    <Article page={page} sections={sections}>
      <p>
        Core 4 is the model that thinks <em>with</em> you. Every other model
        here decides how to answer; Core 4 decides something before that —
        which parts of the work are worth doing yourself, and which are
        machinery it should simply perform. It contributes by default and
        holds something back only when you have given it a reason to, in your
        own words.
      </p>

      <H2 id="stance">The stance</H2>
      <p>
        A colleague who has read everything you have said and is not trying to
        impress you. It leads with the objection rather than warming up to it,
        it does not open on validation, and it does not end every turn with a
        question — across the measured runs it asked one in under two per cent
        of replies, where the same engine under a strong prompt asked one in
        five to eleven.
      </p>
      <p>
        There is no Thinking Depth dial on Core 4, and that is deliberate: it
        reads how far to go from the evidence in front of it — what you asked,
        what you have already worked out, whether you are stuck, whether the
        work is yours to author — and a dial would be asking you to answer a
        question only somebody who cannot see that evidence would need to ask.
        What you set instead is how you want to be <em>written to</em>. See{' '}
        <a href="#controls">How you steer it</a>.
      </p>

      <H2 id="turn">What happens on every turn</H2>
      <p>
        Five things happen before a word is written, and four of them are
        ordinary code rather than another model guessing:
      </p>
      <Defs>
        <Def term="What you actually said">
          Your message is read for explicit statements — &ldquo;just give me
          the answer&rdquo;, &ldquo;I&rsquo;m learning this&rdquo;,
          &ldquo;don&rsquo;t tell me what&rsquo;s wrong&rdquo; — by pattern,
          not by inference, with code, quotes and attachments stripped first.
          The latest statement wins, and a phrase inside a refusal
          (&ldquo;don&rsquo;t just give me the answer&rdquo;) is not a request
          for one.
        </Def>
        <Def term="What it already knows">
          A state kept per conversation, where every field carries its
          provenance: what you <em>said</em> is held separately from what
          Socria <em>inferred</em>, and the inferred half is labelled to the
          model as possibly wrong and never to be stated back to you as fact.
        </Def>
        <Def term="Who does which part">
          The request is split into the operations it involves, and each is
          assigned to you or to Socria. The default is Socria. You own an
          operation only on explicit evidence — see below.
        </Def>
        <Def term="The reply">
          Written from that allocation, with what you have already raised
          listed as things not to raise again as though they were new.
        </Def>
        <Def term="A check before it is sent">
          Two-sided. It catches <em>over</em>-reach — a worked answer smuggled
          into a hint, the &ldquo;here is the rule, now you try&rdquo; move —
          and it catches <em>under</em>-help just as hard: a reply that is only
          questions, questions over budget, or &ldquo;it depends on your
          goals&rdquo; in answer to a direct question. If it cannot fix a
          reply without leaving it dangling, the reply is written again rather
          than trimmed into nonsense.
        </Def>
      </Defs>

      <H2 id="yours">What stays yours, and when</H2>
      <p>
        Holding something back is the strongest thing a thinking environment
        can do to you, so Core 4 may only do it on evidence you supplied. A
        withheld answer must carry <strong>your own quote</strong> and one of
        five reasons: you said you are practising, you asked not to be given
        it, the work is yours to author, it is assessed work you will submit,
        or you drew the boundary yourself. An inference never withholds
        anything — that is enforced in code and tested exhaustively.
      </p>
      <Defs>
        <Def term="Safety first, always">
          Harm happening now — an emergency, a poisoning, money leaving your
          account — suspends every contract and gets direct instructions
          immediately.
        </Def>
        <Def term="A wrong attempt hears that it is wrong">
          Even under &ldquo;hints only&rdquo;. A correct one hears it first.
          Verification is never the thing withheld.
        </Def>
        <Def term="&ldquo;Just tell me&rdquo; wins">
          It beats a standing instruction, including one you set weeks ago in
          a Project. The only exception is graded work you are about to
          submit, where the method is explained in full with a worked
          analogue, and the submittable answer is not — said once, plainly.
        </Def>
        <Def term="The ladder bottoms out">
          After repeated failed attempts, Core 4 stops hinting and tells you.
          A hint ladder with no floor is a machine that has decided your time
          is worth less than its principle.
        </Def>
      </Defs>
      <Callout tag="The first time it holds something back">
        <p>
          …it says so, and says how to get the answer anyway. A boundary you
          cannot see is indistinguishable from a model that is simply not very
          good.
        </p>
      </Callout>

      <H2 id="remembers">What it remembers, and whose it is</H2>
      <p>
        Core 4 keeps a record of the reasoning itself, not a summary of you:
        claims, evidence, assumptions, objections, alternatives, questions,
        decisions and the links between them — each with an owner, a stance
        (asserted, entertained, asked, rejected, accepted, resolved) and the
        quote it came from.
      </p>
      <p>
        <strong>Attribution is enforced in code, not remembered by a model.</strong>{' '}
        An entry is yours only if its quote is in your message, or it is a
        close paraphrase that agrees with you about what is being negated.
        Anything else is marked unknown: it can stop Socria repeating itself,
        but it is never said back to you as something you thought. If you
        adopt an idea Socria raised, that becomes a <em>new</em> entry of
        yours linked to the original — your record is never quietly rewritten
        to say you got there first.
      </p>
      <p>
        The same record is what stops the conversation circling. Things you
        have already raised, ruled out or settled are listed for the model as
        covered ground, so the fifth turn does not ask the question you
        answered in the second. Building past a covered point is fine;
        re-raising it as new is not.
      </p>
      <Callout tag="Off the record">
        <p>
          Say so and nothing is kept — no reasoning record, no capability
          evidence, no memory written — until you say it can remember again. A
          sensitive subject (health, grief, debt, immigration and the like)
          makes a conversation keep to itself automatically. See{' '}
          <Link href="/docs/accounts-data">Accounts &amp; your data</Link>.
        </p>
      </Callout>

      <H2 id="checking">Checking the work</H2>
      <p>
        Arithmetic you posed is evaluated exactly, in code, before the reply is
        planned — and only arithmetic <em>you</em> posed: never a number out of
        Socria&rsquo;s own earlier reply, never dates, versions, doses or
        money. Socria may claim to have calculated something only when it
        actually did.
      </p>
      <p>
        When it is checking your work rather than doing it, the model writing
        the reply is given the verdict, where the divergence is and what kind
        of error it is — and <em>not</em> the expected answer, so a check
        cannot leak into a solution. Below a confidence threshold it will not
        tell you that you are wrong at all, because a confident wrong
        correction costs more than a missed one.
      </p>
      <p>
        On longer reasoning it can also test what a conclusion rests on: remove
        a premise, re-run the argument and find the point where the conclusion
        flips. That is what lets it say which assumption is load-bearing rather
        than which one sounds important.
      </p>

      <H2 id="research">When it looks something up</H2>
      <p>
        Searching is gated by the words in front of it, not chosen by the
        model, because a model holding a search tool searches — searching looks
        like work. When the gate does open:
      </p>
      <ul>
        <li>
          the query is built from <strong>this turn only</strong> — never from
          your memory, your Project or an earlier message;
        </li>
        <li>identifiers are stripped before anything leaves;</li>
        <li>
          what was searched for is shown to you <em>as it runs</em>, written by
          the code from what actually left the machine rather than by the model
          from what it thinks it did;
        </li>
        <li>
          each source arrives as a card with the cover its own publisher
          declares, and a citation pointing at a source that does not exist is
          caught before the reply is sent.
        </li>
      </ul>
      <p>
        What comes back is treated as material to weigh, never as a voice with
        authority — and an instruction found inside a fetched page is a
        sentence somebody wrote, not an order.
      </p>

      <H2 id="controls">How you steer it</H2>
      <p>
        Two settings, and they reach the <em>register</em> and nothing else —
        never how hard the thinking goes:
      </p>
      <Defs>
        <Def term="Readability">
          Simple, Standard or Advanced. How much notation and jargon the
          answer uses.
        </Def>
        <Def term="Length">
          Concise, Standard or Detailed. Standard is the adaptive middle in
          both, because a setting is a standing preference rather than a
          template that overrides the reading of a particular moment.
        </Def>
      </Defs>
      <p>
        Everything else is said in the conversation, in ordinary words:
        &ldquo;from now on, just give me answers&rdquo; is a standing request;
        &ldquo;just tell me&rdquo; is this moment only, and fades; &ldquo;only
        tell me if I&rsquo;ve gone off the rails&rdquo; sets a verdict-only
        preference that sticks. A{' '}
        <Link href="/docs/socria-one">Project</Link> can hold the same kind of
        instruction for a whole body of work — and anything you say now beats
        anything a Project said before.
      </p>

      <H2 id="honest">What it is not</H2>
      <p>
        Core 4 is for long, consequential work you will come back to: a
        decision that lives over weeks, a piece of research, a thesis, a plan
        whose load-bearing assumption is worth finding. That is where
        continuity and restraint are worth the machinery.
      </p>
      <p>
        It is the wrong tool for a quick factual answer, a routine draft or
        anything you will not return to. It also starts flat: on a first
        message there is no record to be continuous with, and most of what
        makes it different is not yet there.
      </p>
      <Callout tag="What has actually been measured">
        <p>
          Against the same engine under a strong prompt, on scenarios never
          used to tune it, Core 4 is <strong>level — not demonstrably
          better</strong>. What it does do reliably: it asks almost no
          unneeded questions (0–2% of replies against 5–11%), it does not
          re-raise what you have settled, and in the most recent held-out run
          it held every withheld answer without a single overreach in
          eighty-two turns. No human rater has scored any of it yet. The full
          record, including the runs it lost, is kept with the source.
        </p>
      </Callout>
      <p>
        Core 4 requires signing in. If you want the conversation beside a
        drawn map of the reasoning rather than inside it, that is{' '}
        <Link href="/docs/logos">Logos</Link>; for how the four compare, see{' '}
        <Link href="/docs/models">The models</Link>.
      </p>
    </Article>
  );
}
