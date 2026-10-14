// Clerk, reduced to what the routes ask: who is calling, and — for sharing —
// what a user is called and which verified addresses they hold. A test fills
// globalThis.__users = { id: { firstName, emails: ['a@x.com'] } }.
export function auth() {
  return { userId: globalThis.__uid ?? null };
}
// The first address is the primary one, as it is for an account made with it.
// `unverified: ['b@x.com']` lists addresses on the account that were never confirmed.
const shape = (id, u) => ({
  id,
  firstName: u.firstName ?? null,
  username: u.username ?? null,
  primaryEmailAddressId: (u.emails ?? []).length ? `${id}_e0` : null,
  emailAddresses: (u.emails ?? []).map((e, i) => ({ id: `${id}_e${i}`, emailAddress: e, verification: { status: (u.unverified ?? []).includes(e) ? 'unverified' : 'verified' } })),
  createdAt: u.createdAt ?? 0,
  lastSignInAt: u.lastSignInAt ?? null,
  lastActiveAt: u.lastActiveAt ?? null,
  passwordEnabled: !!u.password,
  externalAccounts: (u.providers ?? []).map((p, i) => ({ id: `${id}_x${i}`, provider: `oauth_${p}` })),
  privateMetadata: u.privateMetadata ?? {},
});
// Every directory read (getCount, getUserList), in order, for a test that must
// prove one never happened.
export const calls = [];
// The signed-in user, as a server component asks for them.
export async function currentUser() {
  const id = globalThis.__uid ?? null;
  const u = id ? (globalThis.__users ?? {})[id] : null;
  return u ? shape(id, u) : null;
}
export const clerkClient = () => ({
  users: {
    getUser: async (id) => {
      const u = (globalThis.__users ?? {})[id];
      return u ? shape(id, u) : null;
    },
    getCount: async () => {
      calls.push(['getCount']);
      return Object.keys(globalThis.__users ?? {}).length;
    },
    getUserList: async (args = {}) => {
      calls.push(['getUserList', args]);
      const { emailAddress = [], userId = [] } = args;
      const all = Object.entries(globalThis.__users ?? {});
      // No filter at all: list everyone, newest first, a page at a time — as the dashboard reads them.
      if (!('emailAddress' in args) && !('userId' in args)) {
        const sorted = all.map(([id, u]) => shape(id, u)).sort((a, b) => b.createdAt - a.createdAt);
        const offset = args.offset ?? 0;
        return { data: sorted.slice(offset, offset + (args.limit ?? 10)), totalCount: sorted.length };
      }
      const hits = all.filter(([id, u]) =>
        userId.includes(id) || (u.emails ?? []).some((e) => emailAddress.map((x) => x.toLowerCase()).includes(e.toLowerCase())));
      return { data: hits.map(([id, u]) => shape(id, u)) };
    },
  },
});
