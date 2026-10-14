// components/dashboard/Dashboard.tsx
//
// The developer dashboard, drawn from one DashboardModel (lib/dashboard/
// aggregate.ts). Server-rendered; the only client code is the tooltip layer.
//
// Reading order is the order of the questions: how many are here, how many
// arrived lately, how far they got through onboarding, what they chose on the
// way in, who they are, where they came from, whether they stayed — and,
// last, what this page could and could not read, so no number on it is taken
// for more than it is.

import { RANGES, type DashboardModel, type SourceHealth } from '@/lib/dashboard/types';
import { BarList, BarsTable, Card, Columns, Hero, StatTile, Stacked, compact, pct, shortDate } from './charts';
import { DashboardTooltip } from './DashboardTooltip';

const ENV_LABEL: Record<DashboardModel['env'], string> = {
  production: 'Production',
  preview: 'Preview',
  development: 'Development',
};

const STATE_LABEL: Record<SourceHealth['state'], string> = {
  ok: 'Read',
  truncated: 'Read up to its cap',
  missing: 'Not there yet',
  unconfigured: 'Not configured here',
  error: 'Could not be read',
};

function when(t: number): string {
  const d = new Date(t);
  return `${shortDate(t)}, ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export function Dashboard({ model }: { model: DashboardModel }) {
  const [hero, ...tiles] = model.kpis;
  const c = model.composition;
  const of = (n: number) => `of the ${n.toLocaleString('en-US')} ${c.baseLabel}`;
  return (
    <main className="dash">
      <DashboardTooltip />

      <header className="dash-head">
        <div className="dash-title">
          <p className="dash-kicker">
            <span className={`dash-env is-${model.env}`}>{ENV_LABEL[model.env]}</span> Developer dashboard
          </p>
          <h1>Who is here, and what they chose</h1>
          <p className="dash-meta">
            Generated {when(model.generatedAt)}. Counts only: no names, no email addresses, nothing anyone wrote.
          </p>
        </div>
        {hero ? <Hero kpi={hero} /> : null}
      </header>

      <nav className="dash-filters" aria-label="Time range">
        {RANGES.map((r) => (
          <a key={r.id} href={`?range=${r.id}`} aria-current={r.id === model.range ? 'page' : undefined}>
            {r.id === model.range ? <span aria-hidden="true">✓ </span> : null}
            {r.label}
          </a>
        ))}
      </nav>

      <div className="dash-tiles">
        {tiles.map((k) => (
          <StatTile key={k.id} kpi={k} />
        ))}
      </div>

      {model.notes.length ? (
        <aside className="dash-notes" aria-label="Read these numbers with">
          <h2>Read these numbers with</h2>
          <ul>
            {model.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </aside>
      ) : null}

      <h2 className="dash-h2">Sign-ups</h2>
      {model.signups ? (
        <Card
          wide
          title="New accounts"
          sub={`Per ${model.signups.unit}, ${model.rangeLabel.toLowerCase()} · ${model.signups.total.toLocaleString('en-US')} in all`}
          table={<BarsTable head={[model.signups.unit === 'week' ? 'Week of' : 'Day', 'Sign-ups']} bars={model.signups.bins.map((b) => ({ id: b.label, label: b.label, n: b.n }))} />}
        >
          <Columns bins={model.signups.bins} unit={model.signups.unit} label="New accounts over time" />
        </Card>
      ) : (
        <p className="dash-empty">Sign-ups come from Clerk, which could not be read here.</p>
      )}

      <h2 className="dash-h2">Onboarding</h2>
      <div className="dash-grid">
        {model.funnel ? (
          <Card
            title="How far new accounts got"
            sub={`${of(model.funnel.cohort)} · as recorded on each account`}
            table={<BarsTable bars={model.funnel.stages} total={model.funnel.cohort} head={['Milestone', 'Accounts', 'Of the cohort']} />}
          >
            <BarList bars={model.funnel.stages} of={model.funnel.cohort} label="Onboarding milestones reached" />
            <p className="dash-foot">
              {model.funnel.introSkipped.toLocaleString('en-US')} skipped the intro rather than finished it.
              {model.funnel.medianMinutesToThought !== null ? ` Median time from sign-up to a first thought: ${model.funnel.medianMinutesToThought.toLocaleString('en-US')} min.` : ''}
            </p>
          </Card>
        ) : null}
        {model.onboarding ? (
          <>
            <Card
              title="Pressed Skip"
              sub={(() => {
                const skips = model.onboarding!.skipAt.reduce((s, b) => s + b.n, 0);
                const opened = model.onboarding!.opened;
                return `${skips.toLocaleString('en-US')} presses, against ${opened.toLocaleString('en-US')} openings of the onboarding ${model.rangeLabel.toLowerCase()}${opened ? ` (${pct(skips, opened)})` : ''}`;
              })()}
              table={<BarsTable bars={model.onboarding.skipAt} head={['Where', 'Presses', 'Share']} />}
            >
              <BarList bars={model.onboarding.skipAt} label="Where people pressed Skip" empty="Nobody pressed Skip in this range." />
            </Card>
            {model.onboarding.steps.map((s) => (
              <Card key={s.step} title={s.title} sub={`“${s.question}” · ${s.total.toLocaleString('en-US')} answers`} table={<BarsTable bars={s.bars} head={['Answer', 'Count', 'Share']} />}>
                <BarList bars={s.bars} label={s.title} />
              </Card>
            ))}
          </>
        ) : (
          <Card title="What people choose on the onboarding screen" sub="Counted anonymously, per day">
            <p className="dash-empty">
              Not counted here yet. Run the product_events part of supabase/schema.sql (and rls.sql); answers are counted from then on.
            </p>
          </Card>
        )}
      </div>
      {model.onboarding?.since ? <p className="dash-foot">Onboarding answers have been counted since {model.onboarding.since} (UTC days). Anonymous: a role, a model, a starting point — never who.</p> : null}

      <h2 className="dash-h2">Who they are</h2>
      <p className="dash-lede">{c.base ? `Each chart below is ${of(c.base)}.` : 'No accounts in this range.'}</p>
      <div className="dash-grid">
        <Card title="Where they think" table={<BarsTable bars={c.surfaces} />}>
          <Stacked parts={c.surfaces} label="Core and Logos use" />
        </Card>
        <Card title="Plan" table={<BarsTable bars={c.plans} />}>
          <Stacked parts={c.plans} label="Plan" />
        </Card>
        <Card title="Email address" sub="The kind of address, from its domain" table={<BarsTable bars={c.emails} />}>
          <Stacked parts={c.emails} label="Kind of email address" />
        </Card>
        <Card title="Conversation Style" sub="Chosen under Manage Account" table={<BarsTable bars={c.styles} />}>
          <Stacked parts={c.styles} label="Conversation Style" />
        </Card>
        <Card title="How they sign in" table={<BarsTable bars={c.methods} />}>
          <BarList bars={c.methods} label="Sign-in method" />
        </Card>
        <Card title="Shared domains" sub="Only domains three or more accounts share" table={<BarsTable bars={c.domains} />}>
          <BarList bars={c.domains} of={c.base} label="Email domains" empty="No domain is shared by three or more accounts in this range." />
        </Card>
      </div>

      <h2 className="dash-h2">Where they came from</h2>
      {model.sources ? (
        <>
          <p className="dash-lede">
            {model.sources.total.toLocaleString('en-US')} sign-ups recorded with a first touch {model.rangeLabel.toLowerCase()}. Only kept where the visitor&rsquo;s country allows it, so &ldquo;not recorded&rdquo; is a consent outcome, not a gap.
          </p>
          <div className="dash-grid">
            <Card title="The site that sent them" table={<BarsTable bars={model.sources.referrers} />}>
              <BarList bars={model.sources.referrers} label="Referrers" empty="No sign-ups recorded in this range." />
            </Card>
            <Card title="The page they landed on" table={<BarsTable bars={model.sources.landings} />}>
              <BarList bars={model.sources.landings} label="Landing pages" empty="No sign-ups recorded in this range." />
            </Card>
            <Card title="Campaign" sub="utm_source on one of our own links" table={<BarsTable bars={model.sources.campaigns} />}>
              <BarList bars={model.sources.campaigns} label="Campaigns" empty="No campaign links in this range." />
            </Card>
          </div>
        </>
      ) : (
        <p className="dash-empty">Sign-up sources are counted with the onboarding answers, in the product_events table, which is not there yet.</p>
      )}

      <h2 className="dash-h2">Did they stay</h2>
      <div className="dash-grid">
        <Card title="Conversations per account" sub={of(c.base)} table={<BarsTable bars={model.engagement.histogram} head={['Conversations', 'Accounts', 'Share']} />}>
          <Columns bins={model.engagement.histogram} label="Conversations per account" />
        </Card>
        <div className="dash-tiles is-stack">
          <StatTile
            kpi={{
              id: 'returned',
              label: 'Came back after day one',
              value: model.engagement.returned?.n ?? null,
              ...(model.engagement.returned ? { display: pct(model.engagement.returned.n, model.engagement.returned.of) } : {}),
              hint: model.engagement.returned
                ? `${model.engagement.returned.n.toLocaleString('en-US')} of the ${model.engagement.returned.of.toLocaleString('en-US')} accounts at least two days old`
                : 'no account in this range is two days old yet',
            }}
          />
          <StatTile kpi={{ id: 'median', label: 'Median conversations', value: model.engagement.medianConversations, hint: 'among accounts with at least one' }} />
        </div>
      </div>

      <h2 className="dash-h2">Rewards</h2>
      <div className="dash-tiles">
        <StatTile kpi={{ id: 'ref', label: 'Joined from a referral', value: model.rewards.referralSignups, hint: model.rangeLabel.toLowerCase() }} />
        <StatTile kpi={{ id: 'act', label: 'Referrals activated', value: model.rewards.referralActivations, hint: model.rangeLabel.toLowerCase() }} />
        <StatTile kpi={{ id: 'ch', label: 'Challenges completed', value: model.rewards.challenges, hint: model.rangeLabel.toLowerCase() }} />
        <StatTile kpi={{ id: 'promo', label: 'Promo access now', value: model.rewards.promoActive, hint: 'accounts in a Rewards window' }} />
      </div>

      <h2 className="dash-h2">Recent sign-ups</h2>
      <p className="dash-lede">The latest {model.recent.length} {c.baseLabel}. A domain is shown only where it cannot point at one person.</p>
      <div className="dash-table-wrap">
        <table className="dash-table is-recent">
          <thead>
            <tr>
              <th scope="col">Joined</th>
              <th scope="col">Address</th>
              <th scope="col">Signs in with</th>
              <th scope="col">First thought</th>
              <th scope="col">Core</th>
              <th scope="col">Logos</th>
              <th scope="col">Plan</th>
              <th scope="col">Newsletter</th>
            </tr>
          </thead>
          <tbody>
            {model.recent.map((r, i) => (
              <tr key={i}>
                <td>{shortDate(r.createdAt)}</td>
                <td>{r.domain}</td>
                <td>{r.method}</td>
                <td>{r.thought ? '✓ yes' : 'not yet'}</td>
                <td>{compact(r.core)}</td>
                <td>{compact(r.logos)}</td>
                <td>{r.plan}</td>
                <td>{r.newsletter ? '✓ yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="dash-h2">Data sources</h2>
      <ul className="dash-health">
        {model.health.map((h) => (
          <li key={h.id} className={`is-${h.state}`}>
            <span className="dash-health-icon" aria-hidden="true">{h.state === 'ok' ? '●' : h.state === 'truncated' ? '◐' : '○'}</span>
            <span className="dash-health-label">{h.label}</span>
            <span className="dash-health-state">
              {STATE_LABEL[h.state]}
              {h.state === 'ok' || h.state === 'truncated' ? ` · ${h.rows.toLocaleString('en-US')} rows` : ''}
              {h.note ? ` · ${h.note}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
