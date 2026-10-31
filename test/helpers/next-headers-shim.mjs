// next/headers outside Next: cookies() and headers() answer from the request
// the test is making (globalThis.__req), as they would inside one.
export function cookies() {
  const req = globalThis.__req;
  return {
    get: (name) => req?.cookies?.get(name),
    getAll: () => req?.cookies?.getAll?.() ?? [],
    has: (name) => !!req?.cookies?.get(name),
    set: () => {},
    delete: () => {},
  };
}
export function headers() {
  return globalThis.__req?.headers ?? new Headers();
}
