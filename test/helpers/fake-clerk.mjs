// Clerk, reduced to what the routes ask: who is calling, and — for sharing —
// what a user is called and which verified addresses they hold. A test fills
// globalThis.__users = { id: { firstName, emails: ['a@x.com'] } }.
export function auth() {
  return { userId: globalThis.__uid ?? null };
}
const shape = (id, u) => ({
  id,
  firstName: u.firstName ?? null,
  username: u.username ?? null,
  emailAddresses: (u.emails ?? []).map((e) => ({ emailAddress: e, verification: { status: 'verified' } })),
});
export const clerkClient = () => ({
  users: {
    getUser: async (id) => {
      const u = (globalThis.__users ?? {})[id];
      return u ? shape(id, u) : null;
    },
    getUserList: async ({ emailAddress = [], userId = [] } = {}) => {
      const all = Object.entries(globalThis.__users ?? {});
      const hits = all.filter(([id, u]) =>
        userId.includes(id) || (u.emails ?? []).some((e) => emailAddress.map((x) => x.toLowerCase()).includes(e.toLowerCase())));
      return { data: hits.map(([id, u]) => shape(id, u)) };
    },
  },
});
