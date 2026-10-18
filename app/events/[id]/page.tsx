// app/events/[id]/page.tsx — a public Socria event: what it is, when and where
// (only once the date is confirmed), what to expect, and the RSVP.
//
// Read from the events table on the server; a draft or unknown event is a
// 404. Nothing about who has registered is ever on this page.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Label } from '@/components/journal/ds';
import { pageMetadata } from '@/lib/seo';
import { getEvent } from '@/lib/events/store';
import { publicEvent, whenSaid, type PublicEvent } from '@/lib/events/model';
import { RsvpForm } from '@/components/events/RsvpForm';
import { EventBeacon } from '@/components/events/EventBeacon';
import '../../app-shell.css';
import '../events.css';

// Edits by an admin (a confirmed date, a closed RSVP) show within a minute.
export const revalidate = 60;

async function load(id: string): Promise<PublicEvent | null> {
  try {
    const row = await getEvent(id);
    return row && row.status !== 'draft' ? publicEvent(row) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const e = await load(params.id);
  if (!e) return { title: 'Event not found', robots: { index: false, follow: false } };
  const when = whenSaid(e.when);
  return pageMetadata({
    path: `/events/${e.id}`,
    title: e.title,
    absolute: false,
    description: `${e.summary} ${when ? `${when.date}, ` : ''}${e.location}. Free to attend — RSVP online.`.slice(0, 300),
    og: `events/${e.id}`,
    noindex: e.status === 'cancelled',
  });
}

/** "Socria: In Public 002" → Socria: <em>In Public 002</em> */
function Title({ text }: { text: string }) {
  const at = text.indexOf(': ');
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at + 1)} <span className="em">{text.slice(at + 2)}</span>
    </>
  );
}

export default async function EventPage({ params }: { params: { id: string } }) {
  const e = await load(params.id);
  if (!e) notFound();
  const when = whenSaid(e.when);
  const open = e.status === 'open';
  return (
    <div className="app-root">
      <main className="ev-page">
        <div className="ev-wrap">
          <header className="ev-top">
            <Link href="/" className="auth-mark" aria-label="Socria home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/socria-logo.png" alt="" width={30} height={30} />
              <span>Socria</span>
            </Link>
            {open && (
              <a href="#rsvp" className="ev-ghost">
                RSVP
              </a>
            )}
          </header>

          <div className="ev-grid">
            <div className="ev-main">
              <div className="stack" style={{ gap: 14 }}>
                <Label tone="moss">Socria event · Free</Label>
                <h1 className="ev-h1">
                  <Title text={e.title} />
                </h1>
                <p className="ev-lede">{e.summary}</p>
              </div>

              {e.status === 'cancelled' && <p className="ev-note warn">This event has been cancelled. Registered attendees have been or will be told by email.</p>}

              <dl className="ev-facts">
                <div className="ev-fact">
                  <dt>Date</dt>
                  <dd>{when ? when.date : 'To be announced'}</dd>
                </div>
                <div className="ev-fact">
                  <dt>Time</dt>
                  <dd>{when ? when.time : 'To be announced'}</dd>
                </div>
                <div className="ev-fact wide">
                  <dt>Location</dt>
                  <dd>{e.location}</dd>
                </div>
                <div className="ev-fact wide">
                  <dt>Admission</dt>
                  <dd>
                    Free
                    <small>RSVP so we know you’re coming.</small>
                  </dd>
                </div>
              </dl>
              {!when && <p className="ev-fine">The date and time aren’t confirmed yet. RSVP and we’ll email you as soon as they are.</p>}

              {e.expectations.length > 0 && (
                <section className="stack" style={{ gap: 14 }} aria-labelledby="expect-h">
                  <h2 id="expect-h" className="ev-h2">
                    What to expect
                  </h2>
                  <ul className="ev-expect">
                    {e.expectations.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}

              {e.description && (
                <section className="stack" style={{ gap: 14 }} aria-labelledby="about-h">
                  <h2 id="about-h" className="ev-h2">
                    About
                  </h2>
                  <div className="ev-prose">
                    {e.description.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </section>
              )}
            </div>

            <aside className="ev-side">
              <RsvpForm eventId={e.id} open={open} />
            </aside>
          </div>
        </div>
      </main>
      {open && (
        <div className="ev-sticky">
          <a href="#rsvp" className="ev-btn">
            RSVP — it’s free
          </a>
        </div>
      )}
      <EventBeacon eventId={e.id} />
    </div>
  );
}
