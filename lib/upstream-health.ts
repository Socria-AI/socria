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

export interface HealthReport {
  /** the build actually serving this request — the question a stale deploy makes unanswerable */
  commit: string | null;
  node: string;
  /** whether a key is configured. NEVER the key, and never any part of one. */
  hasApiKey: boolean;
  probes: Probe[];
  /** one line naming what to do, chosen from the probes */
  verdict: string;
}

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
  if (!bad) return 'Everything this check can reach is working. If chat still fails, the fault is after this point — send the ref from the failing reply.';
  return VERDICT[bad.code ?? 'internal'] ?? 'Something failed that this check cannot name.';
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
