import 'server-only';
// lib/upstream-health.ts
//
// Ask the deployment itself what is wrong, instead of asking the person.
//
// WHY THIS EXISTS. Three times now the same incident has run the same way: a
// reply fails, the person sends a screenshot of one sentence, and that
// sentence cannot say which failure it was. Each round of guessing costs them
// another message and us another deploy — and the two facts that would settle
// it in one look (can this deployment reach the provider, and is it even
// running the build we think it is) were never visible from outside.
//
// So: one call, made by the server about itself.
//
// WHAT IT WILL NOT SAY. No key, no fragment of one, no upstream error text,
// no request body — the same discipline as lib/upstream-error.ts, because a
// diagnostic that leaks configuration is a worse bug than the one it
// diagnoses. Every failure is reduced to a code and a fixed sentence; the
// only free text is a model id, which is not a secret, and a commit SHA.

import { classifyUpstream, type UpstreamCode } from './upstream-error';

export interface Probe {
  /** what was tried, in words */
  what: string;
  ok: boolean;
  /** the classification when it failed, absent when it worked */
  code?: UpstreamCode;
  /** the fixed sentence for that code */
  reason?: string;
  /** the class of thing that threw, when nothing classified it */
  detail?: string;
  ms: number;
}

/** Just enough of the OpenAI client to ask whether a model is there. */
export interface ModelProbeClient {
  models: { retrieve(id: string): Promise<unknown> };
}

/**
 * Does this deployment have a key, can it reach the provider, and is the model
 * it is configured to use actually available to the account?
 *
 * `models.retrieve` on purpose: it answers all three and costs no tokens, so
 * running it cannot itself be the thing that exhausts a quota.
 */
export async function probeModels(
  client: ModelProbeClient,
  models: readonly string[],
  now: () => number = Date.now
): Promise<Probe[]> {
  const out: Probe[] = [];
  for (const id of models) {
    const t0 = now();
    try {
      await client.models.retrieve(id);
      out.push({ what: `model ${id}`, ok: true, ms: now() - t0 });
    } catch (e) {
      const f = classifyUpstream(e);
      out.push({ what: `model ${id}`, ok: false, code: f.code, reason: f.reason, detail: f.detail, ms: now() - t0 });
    }
  }
  return out;
}

/**
 * Whether this deployment can actually search, asked by making it search.
 *
 * WHY A SECOND PROBE. The model probes answered "can we reach OpenAI" and
 * nothing else, so when Core 4's lookups silently stopped working the endpoint
 * that exists to end this exact argument reported everything healthy. A key
 * present in the Vercel dashboard is not the same fact as a key the provider
 * accepts from this runtime, and only one of those two facts is worth knowing.
 */
export interface SearchProbe {
  /** whether any provider key is readable from this runtime AT ALL */
  configured: boolean;
  /** which provider would be used, or null when none is configured */
  provider: string | null;
  ok: boolean;
  /** how many results came back */
  results: number;
  /** the provider's HTTP status, when a request got an answer */
  status?: number | null;
  /** the fixed reason, when there were no results */
  why?: string;
  ms: number;
}

/** Just enough of the search layer to ask whether it works. */
export interface SearchProbeClient {
  configured(): boolean;
  run(query: string): Promise<{
    results: readonly unknown[];
    provider: string | null;
    failure?: { provider: string; status: number | null; why: string };
  }>;
}

/**
 * One real query, against whichever provider is configured.
 *
 * A FIXED QUERY, not a caller-supplied one: this endpoint is rate-limited but
 * signed-in, and an arbitrary string here would make it a free search proxy.
 */
export async function probeSearch(
  client: SearchProbeClient,
  now: () => number = Date.now
): Promise<SearchProbe> {
  const t0 = now();
  if (!client.configured()) {
    return { configured: false, provider: null, ok: false, results: 0, why: 'no key', ms: 0 };
  }
  try {
    const bundle = await client.run('socria health check');
    const results = bundle.results.length;
    return {
      configured: true,
      provider: bundle.provider ?? bundle.failure?.provider ?? null,
      ok: results > 0,
      results,
      ...(bundle.failure ? { status: bundle.failure.status, why: bundle.failure.why } : {}),
      ms: now() - t0,
    };
  } catch (e) {
    // runSearch does not throw, so this is our code rather than theirs — named
    // by class only, the same discipline as every other line here.
    return {
      configured: true,
      provider: null,
      ok: false,
      results: 0,
      why: `threw: ${(e as Error)?.name ?? typeof e}`,
      ms: now() - t0,
    };
  }
}

/**
 * Whether Core 4 can read the tables it keeps a person's reasoning in.
 *
 * The same lesson as the search probe, learnt the same way: every read in
 * lib/core4/store.ts fails soft, which is right for a reply in flight and wrong
 * for a deployment, because a missing table fails every read on every turn and
 * the symptoms surface nowhere near the cause. One of those symptoms was Core 4
 * quietly losing its internet.
 */
export interface StoreProbe {
  ok: boolean;
  /** the tables that could not be read, by name. Never any row from them. */
  missing: string[];
  why?: string;
  ms: number;
}

export async function probeStore(
  read: () => Promise<{ ok: boolean; missing: string[]; why?: string }>,
  now: () => number = Date.now
): Promise<StoreProbe> {
  const t0 = now();
  try {
    const r = await read();
    return { ok: r.ok, missing: r.missing, ...(r.why ? { why: r.why } : {}), ms: now() - t0 };
  } catch (e) {
    return { ok: false, missing: [], why: `threw: ${(e as Error)?.name ?? typeof e}`, ms: now() - t0 };
  }
}

export interface HealthReport {
  /** the build actually serving this request — the question a stale deploy makes unanswerable */
  commit: string | null;
  node: string;
  /** whether a key is configured. NEVER the key, and never any part of one. */
  hasApiKey: boolean;
  probes: Probe[];
  /** whether Core 4 can look anything up. Absent on hosts that skip the check. */
  search?: SearchProbe;
  /** whether Core 4 can read its own tables. Absent on hosts that skip the check. */
  store?: StoreProbe;
  /** one line naming what to do, chosen from the probes */
  verdict: string;
}

/** What to do about a search that does not work, by the reason it gave. */
const SEARCH_VERDICT: Record<string, string> = {
  'no key':
    'Neither SERPER_API_KEY nor TAVILY_API_KEY is readable from this runtime, so Core 4 cannot look anything up. Set one and REDEPLOY — Vercel captures environment variables per deployment, so a key added after the last build is not in the build that is serving.',
  rejected:
    'The search provider refused the key this deployment holds. Check the value for stray whitespace or quotes, confirm it is set for the Production environment specifically, and redeploy.',
  'out of credits':
    'The search account is out of credits. Top it up; nothing in the code can work around it.',
  'rate-limited':
    'The search provider is rate-limiting this account. It will recover on its own; if it does not, the plan is too small for the traffic.',
  unreachable:
    'This deployment cannot reach the search provider at all. Check egress, DNS and any proxy or firewall in front of it.',
  'no results':
    'The provider answered and had nothing for the probe query. That is a provider-side oddity rather than a configuration fault — try again.',
};

const VERDICT: Partial<Record<UpstreamCode, string>> = {
  upstream_auth: 'The key this deployment holds is not accepted. Replace OPENAI_API_KEY and redeploy.',
  upstream_quota: 'The account is rate-limited or out of quota. Check billing and usage limits.',
  upstream_model: 'The account cannot reach the configured model id. Check the model exists for this account, or set the OPENAI_MODEL_* override.',
  upstream_unreachable: 'This deployment cannot reach the provider at all. Check egress, DNS and any proxy or firewall in front of it.',
  upstream_timeout: 'The provider answered too slowly to finish the check. Try again; if it persists, treat it as an outage.',
  upstream_unavailable: 'The provider is returning errors of its own. Wait it out.',
  internal: 'The failure is in our code, not the provider. The class of thing that threw is named above.',
};

export function summarise(report: Omit<HealthReport, 'verdict'>): string {
  if (!report.hasApiKey) return 'No OPENAI_API_KEY is set on this deployment. Nothing can work until it is.';
  const bad = report.probes.find((p) => !p.ok);
  // The reply model first: without it there is no reply to put a source in.
  if (bad) return VERDICT[bad.code ?? 'internal'] ?? 'Something failed that this check cannot name.';
  // Then the store, ahead of the web: an unreadable state row is why Core 4
  // loses its memory, its carried-forward reasoning AND — until the fix that
  // came with this probe — its internet, so a missing table explains more
  // symptoms than anything else here and should be the sentence that prints.
  if (report.store && !report.store.ok) {
    const where = report.store.missing.length ? ` (${report.store.missing.join(', ')})` : '';
    return report.store.why === 'table missing'
      ? `Core 4's tables are not in this database${where}. Apply supabase/schema.sql. Until then it has no memory across turns, no carried-forward reasoning, and no lookups.`
      : `Core 4 cannot read its own tables${where}: ${report.store.why ?? 'unknown'}. Check SUPABASE_SERVICE_ROLE_KEY and the database's availability.`;
  }
  // Then the web. Reported even though chat still works without it, because
  // "Core 4 cannot look things up" is a whole feature missing and the symptom
  // — a reply that says it could not pull anything up live — reads to everyone
  // like a bug in the reply rather than a key that is not there.
  if (report.search && !report.search.ok) {
    return (
      SEARCH_VERDICT[report.search.why ?? ''] ??
      'Core 4 cannot look anything up, for a reason this check cannot name.'
    );
  }
  return 'Everything this check can reach is working. If chat still fails, the fault is after this point — send the ref from the failing reply.';
}

/**
 * The commit serving this request, when the host says. Vercel sets it; other
 * hosts may not, and a missing SHA is reported as missing rather than guessed
 * — "which build is this?" answered wrongly is worse than not answered.
 */
export function deployedCommit(env: NodeJS.ProcessEnv = process.env): string | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || env.SOURCE_COMMIT || null;
  return sha ? sha.slice(0, 7) : null;
}
