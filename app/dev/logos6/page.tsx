// app/dev/logos6/page.tsx — LOGOS 6, MEASURED (docs/LOGOS-6-PLAN.md §7; lib/logos6/measure.ts).
//
// What people do with Logos 6 — challenge asked for and shown, what became of each finding, Focus, links,
// sources, comparisons, the learning actions — and whether trial accounts come back of their own accord
// (H4), with each arm beside the total while a feature test runs. Counts and shares only: no person.
//
// DEV ONLY, AND FOR THE OWNER, exactly as app/dev/trial: off production, and only for the owner's account
// or someone named in SOCRIA_DASHBOARD_ADMINS. Everyone else gets the same 404 as a page that does not
// exist. Never indexed or cached.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { NOINDEX } from '@/lib/seo';
import { isProduction } from '@/lib/environment';
import { mayViewDashboard } from '@/lib/dashboard/gate';
import { operatorGranted } from '@/lib/socria-one-grant';
import { collectL6 } from '@/lib/logos6/measure-server';
import type { KeyCount } from '@/lib/logos6/measure';
import '../dashboard/dashboard.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { ...NOINDEX, title: 'Logos 6, measured' };

async function allowed(): Promise<boolean> {
  if (isProduction()) return false;
  try {
    const u = await currentUser();
    if (!u) return false;
    if (operatorGranted(u.emailAddresses as { emailAddress?: string; verification?: { status?: string } }[])) return true;
    return mayViewDashboard({ id: u.id, emails: (u.emailAddresses ?? []).map((e) => ({ address: e.emailAddress, verified: e.verification?.status === 'verified' })) });
  } catch {
    return false;
  }
}

const n = (v: number) => v.toLocaleString('en-GB');
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);
const dec = (v: number | null) => (v === null ? '—' : v.toFixed(2));

/** The events, in the order the plan reads them, and what each is called on the page. */
const SECTIONS: { event: string; title: string; note: string }[] = [
  { event: 'challenge_requested', title: 'Challenge asked for', note: 'by where it was asked (words, the chip, a card, a selection, a document) and what it covered' },
  { event: 'challenge_shown', title: 'Challenge shown', note: 'found something, held up, or structure only (no model answered); count is findings shown' },
  { event: 'finding_action', title: 'What became of findings', note: 'kind:action — kept on the map, thought about, not relevant, talked through, resolved, Show more' },
  { event: 'focus_opened', title: 'Focus opened', note: 'by where from' },
  { event: 'idea_opened', title: 'An idea opened from above its conversation', note: 'a map chip, search, a finding, a link' },
  { event: 'conversation_opened', title: 'A conversation opened', note: 'by door: the Universal Map against the Sessions list and search (H8)' },
  { event: 'level_changed', title: 'Moving between levels', note: 'from>to, and how' },
  { event: 'idea_added', title: 'Ideas added without a reply', note: 'Add as idea' },
  { event: 'evidence_opened', title: 'Evidence opened', note: 'a passage opened from an idea, a check or a comparison' },
  { event: 'source_check', title: 'Checked against sources', note: 'how many claims, and whether any could be checked' },
  { event: 'compare_run', title: 'Where do these disagree?', note: 'documents compared; found or none' },
  { event: 'simpler_deeper', title: 'Simpler / Deeper', note: 'which, and from a reply or an idea' },
  { event: 'explain_back', title: 'Explain it back', note: 'started, and checked' },
  { event: 'guess_first', title: 'Guess first', note: 'taken or skipped; a hit is a guess among the findings' },
  { event: 'one_checkout_context', title: 'Checkouts, and what came before', note: 'the last Logos 6 capability used in the seven days before a checkout began (H5, observational)' },
];

function Keys({ keys, armed }: { keys: KeyCount[]; armed: boolean }) {
  return (
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead>
          <tr>
            <th scope="col">Key</th>
            <th scope="col">Count</th>
            {armed && <th scope="col">Control</th>}
            {armed && <th scope="col">Treatment</th>}
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.kind}>
              <th scope="row">{k.kind}</th>
              <td>{n(k.n)}</td>
              {armed && <td>{n(k.control)}</td>}
              {armed && <td>{n(k.treatment)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Logos6Measured() {
  if (!(await allowed())) notFound();
  const { use, ret, running, errors } = await collectL6();
  const ev = (id: string) => use.events[id];
  const tiles: { label: string; value: string; hint: string }[] = [
    { label: 'Challenges shown', value: n(ev('challenge_shown')?.total ?? 0), hint: `${n(ev('challenge_requested')?.total ?? 0)} asked for, since ${use.since}` },
    { label: 'Findings acted on', value: n(ev('finding_action')?.total ?? 0), hint: 'kept, thought about, not relevant, talked through, resolved' },
    { label: 'Focus opened', value: n(ev('focus_opened')?.total ?? 0), hint: `${n(ev('idea_opened')?.total ?? 0)} ideas opened from above their conversation` },
    { label: 'Voluntary return', value: pct(ret.overall.share), hint: `of ${n(ret.overall.complete)} finished trials, two or more days back of their own accord (days 2–7)` },
    { label: 'Mean days back', value: dec(ret.overall.meanDays), hint: `${n(ret.prompted)} active days not counted: an email went that day or the day before` },
    { label: 'Feature tests', value: running.length ? running.join(', ') : 'none', hint: 'LOGOS6_EXPERIMENTS; arms are counted beside the totals' },
  ];
  return (
    <main className="dash">
      <header className="dash-head">
        <p className="dash-kicker">Developer · dev only</p>
        <h1 className="dash-title">Logos 6, measured</h1>
        <p className="dash-lede">
          The last 28 days of this environment. Counts carry no person; the return measure reads trial accounts&apos; days and emails on the server
          and keeps only the shares.
        </p>
      </header>
      <div className="dash-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="dash-tile">
            <span className="dash-tile-label">{t.label}</span>
            <span className="dash-tile-value">{t.value}</span>
            <span className="dash-tile-hint">{t.hint}</span>
          </div>
        ))}
      </div>
      <section className="dash-card is-wide" aria-labelledby="l6-return">
        <div className="dash-card-head">
          <h2 id="l6-return" className="dash-h2">
            Coming back of their own accord (H4)
          </h2>
        </div>
        {ret.rows.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Week begun</th>
                  <th scope="col">Arm</th>
                  <th scope="col">Trials begun</th>
                  <th scope="col">Finished</th>
                  <th scope="col">Back on 2+ days</th>
                  <th scope="col">Share</th>
                  <th scope="col">Mean days</th>
                </tr>
              </thead>
              <tbody>
                {ret.rows.map((r) => (
                  <tr key={`${r.cohort}|${r.arm}`}>
                    <th scope="row">{r.cohort === '*' ? 'All weeks' : r.cohort}</th>
                    <td>{r.arm}</td>
                    <td>{n(r.begun)}</td>
                    <td>{n(r.complete)}</td>
                    <td>{n(r.returned)}</td>
                    <td>{pct(r.share)}</td>
                    <td>{dec(r.meanDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dash-empty">No trial has begun yet.</p>
        )}
      </section>
      {SECTIONS.map((s) => {
        const e = ev(s.event);
        return (
          <section key={s.event} className="dash-card is-wide" aria-labelledby={`l6-${s.event}`}>
            <div className="dash-card-head">
              <h2 id={`l6-${s.event}`} className="dash-h2">
                {s.title}
              </h2>
              <span className="dash-tile-hint">{s.note}</span>
            </div>
            {e && e.keys.length ? <Keys keys={e.keys} armed={use.armed} /> : <p className="dash-empty">Nothing counted yet.</p>}
          </section>
        );
      })}
      {errors.length > 0 && (
        <section className="dash-card is-wide">
          <h2 className="dash-h2">Sources that could not be read</h2>
          <ul className="dash-notes">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
