// app/dev/trial/page.tsx — THE SEVEN-DAY TRIAL, COUNTED: activations, days a limit was reached, trials
// ended, upgrades and conversion, and what the trials' tokens cost (lib/trial-analytics.ts).
//
// DEV ONLY, AND FOR THE OWNER. Off production (a preview or a local server) and only for the owner's
// account — its verified address matched by the permanent grant's hash (lib/socria-one-grant.ts
// OPERATOR_GRANTS), never an address written here — or someone named in SOCRIA_DASHBOARD_ADMINS.
// Everyone else, and production, gets the same 404 as a page that does not exist. Never indexed or cached.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import { NOINDEX } from '@/lib/seo';
import { isProduction } from '@/lib/environment';
import { mayViewDashboard } from '@/lib/dashboard/gate';
import { operatorGranted } from '@/lib/socria-one-grant';
import { collectTrial } from '@/lib/trial-analytics-server';
import { trialModel } from '@/lib/trial-analytics';
import { TRIAL } from '@/lib/trial';
import '../dashboard/dashboard.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = { ...NOINDEX, title: 'Trial analytics' };

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
const usd = (v: number) => `$${v.toFixed(2)}`;
const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1)}%`);

export default async function TrialAnalytics() {
  if (!(await allowed())) notFound();
  const { inputs, errors } = await collectTrial();
  const m = trialModel(inputs, process.env);
  const tiles: { label: string; value: string; hint: string }[] = [
    { label: 'Trials begun', value: n(m.activated), hint: `${n(m.activeNow)} running now` },
    { label: 'Upgrades', value: n(m.upgrades), hint: `${n(m.upgradesInTrial)} in a trial · ${n(m.upgradesAfterTrial)} after · ${n(m.upgradesNoTrial)} without one` },
    { label: 'Trial conversion', value: pct(m.conversion), hint: 'upgrades from a trial ÷ trials begun' },
    { label: 'Days a limit was reached', value: n(m.limitHits), hint: `once per person per day, at ${n(TRIAL.daily)} tokens` },
    { label: 'Trials ended', value: n(m.ended), hint: 'refused once after the seven days' },
    { label: 'Tokens spent in trials', value: n(m.tokens), hint: m.tokensPerTrial === null ? '—' : `${n(m.tokensPerTrial)} a trial on average` },
    { label: 'Estimated inference cost', value: usd(m.cost), hint: 'tokens × SOCRIA_COST_PER_MTOK (default $2 a million)' },
  ];
  return (
    <main className="dash">
      <header className="dash-head">
        <p className="dash-kicker">Developer · dev only</p>
        <h1 className="dash-title">The seven-day trial</h1>
        <p className="dash-lede">
          {TRIAL.days} days from the first real request, {n(TRIAL.daily)} tokens a UTC day, {n(TRIAL.total)} in all. Counts carry no
          person; tokens are summed across trial accounts.
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
      <section className="dash-card is-wide" aria-labelledby="tr-days">
        <div className="dash-card-head">
          <h2 id="tr-days" className="dash-h2">
            The last {m.days.length || 14} days
          </h2>
        </div>
        {m.days.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th scope="col">Day (UTC)</th>
                  <th scope="col">Trials begun</th>
                  <th scope="col">Limits reached</th>
                  <th scope="col">Trials ended</th>
                  <th scope="col">Upgrades</th>
                  <th scope="col">Tokens</th>
                  <th scope="col">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {m.days.map((d) => (
                  <tr key={d.day}>
                    <th scope="row">{d.day}</th>
                    <td>{n(d.activated)}</td>
                    <td>{n(d.limitHits)}</td>
                    <td>{n(d.ended)}</td>
                    <td>{n(d.upgrades)}</td>
                    <td>{n(d.tokens)}</td>
                    <td>{usd(d.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dash-empty">No trial has begun yet.</p>
        )}
      </section>
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
