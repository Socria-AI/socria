// Clerk, reduced to the one fact the routes ask: who is calling.
export function auth() {
  return { userId: globalThis.__uid ?? null };
}
export const clerkClient = () => ({ users: { getUser: async () => null } });
