// lib/token-meter.ts — WHOSE REQUEST A MODEL CALL IS MADE FOR (SERVER ONLY).
//
// Sleep Mode counts the AI requests a free account makes against its week of
// tokens (lib/sleep.ts). A route that has checked the week (sleepGate in
// lib/sleep-server.ts) meters the rest of its request: every model call made
// from there on — the reply, a map pass, a reading, however deep in the code
// it is made — is held against that account and settled when it ends, without
// each call being told whose it is. AsyncLocalStorage carries the account
// from the route to the call.
//
// A CONTEXT OF ITS OWN FOR EVERY REQUEST. A metered route's handler is
// wrapped in withMeter(), which runs it in a fresh context; meterFor() then
// fills that context in. It used to enter the account with
// AsyncLocalStorage.enterWith, which attaches it to whatever async resource
// happens to be running — and that can outlive the request: a request handled
// after it in the same process, a guest's included, was then counted to the
// first person's week (test/sleep.test.mjs holds this down). A route that is
// not wrapped still meters through enterWith, so a call is never left
// uncounted, and the suite holds every metered route to the wrapper.
//
// uncounted(fn) is how code says a call is OURS and not the person's: a
// second attempt after our own check rejected the first, the memory kept
// about them, a check or regulation pass on a draft, reading a conversation's
// state. Calls made inside it are never held or counted.
//
// No imports beyond node: lib/openai-usage.ts, lib/core4/model.ts and
// lib/mind/pipeline.ts can use it without reaching the database.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface Meter {
  /** the account the request is counted to */
  userId: string;
  /** the week's limit, read once when the request was checked */
  limit: number;
}

interface Box {
  meter: Meter | null;
  /** a request's own context (withMeter), which meterFor fills in */
  own: boolean;
}

const meters = new AsyncLocalStorage<Box>();

/**
 * A route handler, run in a context of its own: whatever account its request
 * is metered to stays with that request and the work it starts, and can never
 * reach another. Every route that meters a request exports its handler
 * through this.
 */
export function withMeter<A extends unknown[], R>(handler: (...args: A) => R): (...args: A) => R {
  return (...args: A) => meters.run({ meter: null, own: true }, () => handler(...args));
}

/** Meter the rest of this request — the route itself calls it (lib/sleep-server.ts meterFor). */
export function enterMeter(meter: Meter): void {
  const box = meters.getStore();
  if (box?.own) {
    box.meter = meter;
    return;
  }
  // not wrapped in withMeter: entered where we are, which is how it always worked, leaks and all
  meters.enterWith({ meter, own: false });
}

/** The account the current model call is counted to, or null when it is not counted. */
export function currentMeter(): Meter | null {
  return meters.getStore()?.meter ?? null;
}

/** Run work that is ours, not theirs: no model call made inside it is held or counted. */
export function uncounted<T>(fn: () => T): T {
  return meters.run({ meter: null, own: false }, fn);
}
