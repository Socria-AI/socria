// Stripe, reduced to what the webhook asks: is this body signed by us, and
// what is this subscription NOW. A test fills
//
//   globalThis.__stripe = { subs: { sub_1: {...} }, down: false, calls: [] }
//
// `subs` is Stripe's own record — the latest state — which can differ from
// the state an event carries, as it does when events arrive out of order.
// `down` makes every API call fail the way a network failure does. The
// signature is a stand-in: a body is signed when its header is `sig:<secret>`.
const state = () => globalThis.__stripe ?? {};

export default class Stripe {
  constructor(key, opts) {
    this.key = key;
    this.opts = opts;
    this.webhooks = {
      constructEvent: (raw, sig, secret) => {
        if (sig !== `sig:${secret}`) {
          throw Object.assign(new Error('No signatures found matching the expected signature for payload.'), { type: 'StripeSignatureVerificationError' });
        }
        return JSON.parse(raw);
      },
    };
    this.subscriptions = {
      retrieve: async (id) => {
        const s = state();
        s.calls?.push(['subscriptions.retrieve', id]);
        if (s.down) throw Object.assign(new Error('An error occurred with our connection to Stripe.'), { type: 'StripeConnectionError' });
        const sub = s.subs?.[id];
        if (!sub) throw Object.assign(new Error(`No such subscription: '${id}'`), { type: 'StripeInvalidRequestError', code: 'resource_missing', statusCode: 404 });
        return structuredClone(sub);
      },
    };
    this.customers = {
      retrieve: async (id) => {
        state().calls?.push(['customers.retrieve', id]);
        return { id };
      },
    };
  }
}
