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
  | 'upstream_unreachable'
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
  /**
   * For 'internal' only: the error's CLASS NAME, nothing else.
   *
   * An unclassified failure used to read "Something went wrong on our side."
   * — true of a bug in our code and of a provider nobody could reach, which
   * are not the same problem and do not have the same fix. A class name
   * ("TypeError") separates the two and cannot carry a request body, a URL or
   * a key fragment, which is what the rest of this file is careful about.
   */
  detail?: string;
}

const SAY: Record<UpstreamCode, string> = {
  upstream_auth:
    'Socria could not authenticate with the model provider. This is our configuration, not anything you did.',
  upstream_quota:
    'The model provider is rate-limiting or has run out of quota. This is on our side — try again shortly.',
  upstream_model:
    'The model Socria is configured to use is unavailable to this deployment. This is our configuration, not anything you did.',
  upstream_timeout: 'The model took too long to answer. Nothing was counted — try again.',
  upstream_unreachable:
    'Socria could not reach the model provider at all — the request never arrived. This is our network or configuration, not anything you did.',
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
 * The error, and everything it was caused by.
 *
 * Node's fetch reports a dead socket as `TypeError: fetch failed` and hides
 * the part that says why — ECONNREFUSED, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT —
 * one or more `cause` links down. Reading only the top said "fetch failed",
 * which matched nothing here and came out as "Something went wrong on our
 * side": the one sentence this file exists to stop.
 */
function chain(err: unknown, depth = 4): Array<{ message: string; code: string; name: string }> {
  const out: Array<{ message: string; code: string; name: string }> = [];
  let e = err as { message?: unknown; code?: unknown; name?: unknown; cause?: unknown } | null;
  for (let i = 0; e && typeof e === 'object' && i <= depth; i++) {
    out.push({
      message: typeof e.message === 'string' ? e.message.toLowerCase() : '',
      code: typeof e.code === 'string' ? e.code.toLowerCase() : '',
      name: typeof e.name === 'string' ? e.name : '',
    });
    e = e.cause as typeof e;
  }
  return out;
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
  const links = chain(err);
  // Any link may hold the reason; a bare "fetch failed" never does.
  const msg = links.map((l) => l.message).join(' | ');
  const code = links.map((l) => l.code).join(' | ');
  const names = links.map((l) => l.name);
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
    names.includes('AbortError') ||
    names.includes('APIConnectionTimeoutError') ||
    /timeout|timed out|etimedout|econnreset|socket hang up/.test(msg) ||
    /etimedout|econnreset|und_err_connect_timeout|und_err_headers_timeout/.test(code)
  ) {
    return is('upstream_timeout', 504);
  }
  // The request never left, or never landed: DNS, a refused socket, blocked
  // egress, a wrong base URL. The SDK says "Connection error."; Node's fetch
  // says "fetch failed" and puts the reason in `cause`.
  if (
    names.includes('APIConnectionError') ||
    /fetch failed|connection error|network error|enotfound|econnrefused|eai_again|unable to connect/.test(msg) ||
    /enotfound|econnrefused|eai_again|epipe|und_err_socket|certificate/.test(code)
  ) {
    return is('upstream_unreachable', 502);
  }
  if (typeof status === 'number' && status >= 500) {
    return is('upstream_unavailable', 502);
  }
  // Unclassified: say WHICH class of thing threw, so a bug in our code is not
  // reported in the same words as a provider problem.
  const named = names.find((n) => n && n !== 'Error');
  return named ? { ...is('internal', 500), detail: named } : is('internal', 500);
}

/**
 * Log the whole truth against the reference, and hand back only the part that
 * is safe to send. One call so the two can never drift apart — a reference in
 * a response that appears in no log is worse than no reference at all.
 */
export function reportUpstream(where: string, err: unknown): UpstreamFailure {
  const f = classifyUpstream(err);
  console.error(`[${where}] ${f.code}${f.detail ? ` ${f.detail}` : ''} ref=${f.ref}`, err);
  return f;
}

/**
 * What the person actually reads when a request fails.
 *
 * THE OMISSION THIS FIXES. classifyUpstream put a six-character reference in
 * every error body so somebody could quote it and we could find their failure
 * in the log. The client then read `body.error` and dropped `code` and `ref`
 * on the floor — so the reference existed, was written to the log, and was
 * never once shown to a human. A reference nobody can see is a reference
 * nobody can quote, which was the entire point of producing it.
 *
 * Kept here, beside the thing that mints the reference, so the two halves of
 * one idea cannot drift apart. Pure and total: this runs inside a catch, and
 * an error formatter that throws would replace a bad error with a worse one.
 */
export function failureText(body: unknown, fallback = 'Something went wrong.'): string {
  const b = body as { error?: unknown; ref?: unknown } | null;
  const said = typeof b?.error === 'string' ? b.error.trim() : '';
  // A sentence, or the fallback — never an empty banner, and never an object
  // stringified into something nobody can read.
  const sentence = said && said.length <= 400 ? said : fallback;
  const ref = typeof b?.ref === 'string' ? b.ref.trim() : '';
  // The reference is ours, not theirs: six characters of [a-z0-9] from
  // reference(). Anything else in that field did not come from us and is not
  // repeated back into the UI.
  if (!/^[a-z0-9]{4,12}$/.test(ref)) return sentence;
  return `${sentence} (ref ${ref})`;
}

/**
 * The same classification, for a failure that lands AFTER the response has
 * started streaming.
 *
 * THE GAP THIS CLOSES. Everything above runs in the route's outer catch — the
 * one that can still choose a status code and a JSON body. But a streamed
 * reply awaits the provider's FIRST TOKEN inside the stream, so the three
 * failures this module exists to tell apart (an expired key, a model the
 * account cannot reach, the provider being down) all arrive after the headers
 * have gone out. They were caught there and rendered as one sentence:
 *
 *     [Connection interrupted. Please try again.]
 *
 * which is the same unactionable answer as `{"error":"Internal error"}`, one
 * layer further in — and worse than nothing when retrying cannot help,
 * because it asks the person to keep trying something that will keep failing.
 * Reported again from dev: every reply, including "hi", came back as exactly
 * that line and nothing else.
 *
 * Same discipline as the rest of the file: nothing from the error is
 * forwarded, only a fixed sentence and a reference that is also in the log.
 */
export function streamFailureNotice(where: string, err: unknown, sentSomething: boolean): string {
  const f = reportUpstream(where, err);
  const reason = f.detail ? `${f.reason} (${f.detail})` : f.reason;
  // Mid-reply, the sentence has to say the reply stopped — the person can see
  // that it did, and an explanation that ignores it reads as a non-sequitur.
  return sentSomething
    ? `\n\n[The reply stopped here. ${reason} (ref ${f.ref})]`
    : `\n\n[${reason} (ref ${f.ref})]`;
}
