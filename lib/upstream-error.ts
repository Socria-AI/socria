// lib/upstream-error.ts
//
// What to say when the thing behind us fails.
//
// THE REPORT THAT PROMPTED THIS. Tobias Lasco wrote in: every chat errored
// before producing a word. He tried reloading, a new conversation, signing out
// and back in; he sent a screenshot; he offered, unprompted, to paste anything
// useful from the network tab — and then pasted four responses, none of which
// could say what went wrong, because the one that knew answered:
//
//     { "error": "Internal error" }
//
// Three failures look identical through that: an expired API key, a model the
// account cannot reach, and the provider being down. So nobody could act —
// not him, not us. A person who takes the trouble to report a fault should not
// be the one who cannot see it.
//
// WHAT THIS IS CAREFUL ABOUT. An upstream error object carries things a
// browser should never receive: request bodies, internal URLs, occasionally a
// key fragment in a header echo. So nothing from it is forwarded verbatim.
// Instead it is CLASSIFIED — into one of a fixed set of codes with a sentence
// each — and given a short reference that is also written to the server log.
// The person gets a sentence they can act on plus six characters to quote; the
// log keeps everything else.

export type UpstreamCode =
  | 'upstream_auth'
  | 'upstream_quota'
  | 'upstream_model'
  | 'upstream_timeout'
  | 'upstream_unavailable'
  | 'internal';

export interface UpstreamFailure {
  code: UpstreamCode;
  /** one sentence, safe to render, written for the person rather than for us */
  reason: string;
  /** what to answer the request with */
  status: number;
  /** six characters, in the response AND in the server log, to tie them together */
  ref: string;
}

const SAY: Record<UpstreamCode, string> = {
  upstream_auth:
    'Socria could not authenticate with the model provider. This is our configuration, not anything you did.',
  upstream_quota:
    'The model provider is rate-limiting or has run out of quota. This is on our side — try again shortly.',
  upstream_model:
    'The model Socria is configured to use is unavailable to this deployment. This is our configuration, not anything you did.',
  upstream_timeout: 'The model took too long to answer. Nothing was counted — try again.',
  upstream_unavailable: 'The model provider is having trouble right now. Try again shortly.',
  internal: 'Something went wrong on our side.',
};

/** Six characters somebody can read over the phone. */
function reference(): string {
  return Math.random().toString(36).slice(2, 8);
}

function statusOf(e: unknown): number | null {
  const x = e as { status?: unknown; response?: { status?: unknown } } | null;
  const s = x?.status ?? x?.response?.status;
  return typeof s === 'number' ? s : null;
}

/**
 * Classify a failure, and say the one sentence worth saying about it.
 *
 * The order matters: a 404 that mentions a model is a model problem, and a 404
 * that does not is the provider being lost. Authentication is checked before
 * everything because a bad key answers 401 to every request and would
 * otherwise be read as whatever the last branch happened to catch.
 */
export function classifyUpstream(err: unknown): UpstreamFailure {
  const e = err as { message?: unknown; code?: unknown; name?: unknown } | null;
  const msg = typeof e?.message === 'string' ? e.message.toLowerCase() : '';
  const code = typeof e?.code === 'string' ? e.code.toLowerCase() : '';
  const status = statusOf(err);
  const ref = reference();

  const is = (c: UpstreamCode, httpStatus: number): UpstreamFailure => ({
    code: c,
    reason: SAY[c],
    status: httpStatus,
    ref,
  });

  if (status === 401 || status === 403 || /api key|unauthor|invalid_api_key/.test(msg)) {
    return is('upstream_auth', 502);
  }
  if (status === 429 || /rate limit|quota|insufficient_quota/.test(msg)) {
    return is('upstream_quota', 503);
  }
  if (
    status === 404 ||
    /model/.test(code) ||
    /model .*(does not exist|not found|unavailable)|do not have access to model/.test(msg)
  ) {
    return is('upstream_model', 502);
  }
  if (
    e?.name === 'AbortError' ||
    /timeout|timed out|etimedout|econnreset|socket hang up/.test(msg) ||
    /etimedout|econnreset/.test(code)
  ) {
    return is('upstream_timeout', 504);
  }
  if (typeof status === 'number' && status >= 500) {
    return is('upstream_unavailable', 502);
  }
  return is('internal', 500);
}

/**
 * Log the whole truth against the reference, and hand back only the part that
 * is safe to send. One call so the two can never drift apart — a reference in
 * a response that appears in no log is worse than no reference at all.
 */
export function reportUpstream(where: string, err: unknown): UpstreamFailure {
  const f = classifyUpstream(err);
  console.error(`[${where}] ${f.code} ref=${f.ref}`, err);
  return f;
}
