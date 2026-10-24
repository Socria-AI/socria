// Supabase Storage, in memory, for the routes that keep files — reduced to
// what lib/write/media-store.ts asks of it: a bucket found or made, one file
// put, read, listed, removed, and links signed for an export.
//
// It keeps the rules a real bucket enforces, because a fake that accepted
// anything would let the code pass by doing what storage refuses: a private
// bucket's size ceiling and its allowed types, and an upload to a path that
// is already taken refused unless it asks to replace (`upsert`) — with the
// message Supabase sends. State lives on globalThis.__storage so every bundle
// that imports this shares it; a test resets it by deleting that.

const state = () => (globalThis.__storage ??= { buckets: new Map(), calls: [] });

function bucketApi(name) {
  const s = state();
  const files = () => s.buckets.get(name)?.files;
  return {
    async upload(path, bytes, opts = {}) {
      s.calls.push(['upload', name, path]);
      const b = s.buckets.get(name);
      if (!b) return { data: null, error: { message: 'Bucket not found', statusCode: '404' } };
      const body = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (b.opts.fileSizeLimit && body.length > b.opts.fileSizeLimit) return { data: null, error: { message: 'The object exceeded the maximum allowed size', statusCode: '413' } };
      const type = opts.contentType ?? 'application/octet-stream';
      if (b.opts.allowedMimeTypes?.length && !b.opts.allowedMimeTypes.includes(type)) return { data: null, error: { message: `mime type ${type} is not supported`, statusCode: '415' } };
      if (b.files.has(path) && !opts.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      b.files.set(path, { bytes: body.slice(), type, at: new Date().toISOString() });
      return { data: { path }, error: null };
    },
    async download(path) {
      s.calls.push(['download', name, path]);
      const f = files()?.get(path);
      if (!f) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
      return { data: new Blob([f.bytes], { type: f.type }), error: null };
    },
    async list(prefix = '', opts = {}) {
      s.calls.push(['list', name, prefix]);
      const all = [...(files() ?? new Map()).entries()]
        .filter(([p]) => p.startsWith(prefix ? `${prefix}/` : ''))
        .map(([p, f]) => ({ name: p.slice(prefix ? prefix.length + 1 : 0), id: p, created_at: f.at, metadata: { size: f.bytes.length, mimetype: f.type } }))
        .filter((f) => !f.name.includes('/'))
        .sort((a, b) => a.name.localeCompare(b.name));
      const offset = opts.offset ?? 0;
      return { data: all.slice(offset, offset + (opts.limit ?? 100)), error: null };
    },
    async remove(paths) {
      s.calls.push(['remove', name, paths.length]);
      const gone = paths.filter((p) => files()?.delete(p));
      return { data: gone.map((p) => ({ name: p })), error: null };
    },
    async createSignedUrls(paths, expiresIn) {
      s.calls.push(['sign', name, paths.length, expiresIn]);
      return { data: paths.map((p) => ({ path: p, error: null, signedUrl: `https://storage.test/object/sign/${name}/${p}?expires=${expiresIn}` })), error: null };
    },
  };
}

export function supabaseAdmin() {
  const s = state();
  return {
    storage: {
      async getBucket(name) {
        const b = s.buckets.get(name);
        return b ? { data: { name, ...b.opts }, error: null } : { data: null, error: { message: 'Bucket not found', statusCode: '404' } };
      },
      async createBucket(name, opts = {}) {
        s.calls.push(['createBucket', name, opts]);
        if (s.buckets.has(name)) return { data: null, error: { message: 'The resource already exists' } };
        s.buckets.set(name, { opts, files: new Map() });
        return { data: { name }, error: null };
      },
      from: bucketApi,
    },
  };
}
