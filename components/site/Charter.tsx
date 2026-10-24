// components/site/Charter.tsx — the Socria Charter, from `Socria Charter` in
// the design project: the founding text set as one column, with the same
// document to keep as a PDF (public/socria-charter.pdf, the design project's
// uploads/charter.pdf with its metadata titled).
//
// The words are the Charter's and are not edited here. The PDF and this page
// say the same thing; a change to one is a change to both.

import { Button } from '@/components/ds';
import { CHARTER_PDF, HOME, ONE, PRIVACY, SiteFoot, SiteMast, SitePage, START, TERMS } from './chrome';

/** The Charter's paragraphs, in order. `No.` stands alone, as it does in the text. */
export const CHARTER_TEXT: readonly string[] = [
  'Socria exists to build artificial intelligence for one purpose: human enhancement. This Charter is our oath. It binds everyone who builds Socria and every generation that follows, long after the people who wrote it are gone.',
  'The most powerful companies and research labs on Earth are racing to build machines that think for us. Every release is celebrated for how much human work it swallows. Every benchmark marks another skill people will never need to learn. The machine grows stronger every year, and the people using it grow quieter and weaker. They call this progress. We call it surrender, and we refuse it.',
  'Look at what humanity has done. We split the atom. We mapped the genome. We crossed oceans in wooden ships and walked on the Moon with less computing power than a wristwatch. We did it with stubborn, flawed, magnificent minds. Now we are told to build something smarter than ourselves, hand it the keys, and step aside.',
  'No.',
  'AI may surpass us in every measurable way, and we welcome it. But intelligence is a capability, not a crown. A hammer drives a nail better than a fist, and it has never once owned the carpenter. Nothing Socria builds will be treated as humanity’s successor, its ruler, or its god. There will always be an off switch, and a human hand will always be able to reach it.',
  'AI was never meant to take the work out of our hands. It was meant to put more power into them. Its purpose is human enhancement, the strengthening of the human condition itself: sharper minds, stronger judgment, deeper curiosity. A car so advanced its passengers forget how to walk is not progress. It is a beautiful cage. We will automate the tedious. We will never automate the need to think.',
  'Weigh the stakes. An AI built to replace us fails catastrophically: skills wither, power concentrates, and one day humanity cannot stand without the machine holding it up. An AI built to strengthen us has a different worst case. If it fails, we are where we started. If it succeeds, we are sharper, braver, and still in command of our own future. What is the danger in building AI to help humanity? The worst that can happen is a humanity that thinks better. The real danger is building anything else.',
  'Good AI has a precise meaning here. It leaves the person using it more capable, never more dependent. It shows its reasoning and answers to human judgment. It serves the people in front of it before the company behind it. It is measured by what people can do when it is not in the room, never by attention captured or dependence sold. If we build AI smarter than all of us, it will have one purpose: to lift humanity higher than it could ever climb alone. AI gets smarter. Humans do too.',
  'We will compete. We will build fast and aim high. But we will never buy speed with human safety, and we will never trade human freedom for a head start. If Socria itself ever threatens human survival or self-determination, our mission will no longer be to protect Socria. It will be to stop it. The ship can be rebuilt. The people on it cannot.',
  'Our loyalty belongs to no model, no benchmark, no investor, no founder, and not to Socria itself. It belongs to humanity. Dangerous systems will be shut down. Leaders who betray this Charter will be removed. There are no exceptions.',
  'A fire brigade is built before the fire. If the day comes when AI turns against humanity, someone must already be standing between the machine and the people it threatens. Socria will be standing there. We cannot promise we will be the ones who save humanity. We promise we will be the ones who tried, and that we will not be moved. If good AI is built at all, it will be built here.',
  'We built the machines. We decide what they are for. Whatever comes next, we will meet it standing.',
];

export function Charter() {
  return (
    <SitePage>
      <SiteMast
        links={[HOME, ONE, { href: CHARTER_PDF, label: 'Download the PDF', download: true }]}
        go={
          <Button as="a" href={START} variant="primary" size="md">
            Start a conversation
          </Button>
        }
      />
      <main>
        <article className="s-sec s-charter" aria-labelledby="s-charter-h">
          <div className="s-label s-charter-run">
            <span>The Socria Charter</span>
            <span>Public · MMXXVI</span>
          </div>
          <p className="s-label s-charter-eb">The founding constitution of Socria</p>
          <h1 id="s-charter-h">The Socria Charter</h1>
          <p className="s-charter-deck">The machines work for us. Not the other way around.</p>

          <div className="s-charter-body">
            {CHARTER_TEXT.map((p, i) => (
              <p key={i} className={p === 'No.' ? 's-no' : undefined}>
                {p}
              </p>
            ))}
          </div>

          <div className="s-charter-end">
            <p>The machines work for us.</p>
            <p>Not the other way around.</p>
          </div>

          <SiteFoot
            links={[PRIVACY, TERMS, { href: CHARTER_PDF, label: 'Download the PDF →', download: true, className: 'is-pdf' }]}
          />
        </article>
      </main>
    </SitePage>
  );
}
