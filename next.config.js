/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The PDF reader (lib/file-extract.ts) is a build of pdf.js made to run
    // as-is on serverless Node. Loaded from node_modules at runtime rather
    // than re-bundled, so production runs exactly what the tests run.
    serverComponentsExternalPackages: ['unpdf'],
  },
  // Addresses whose page was taken out, and where each one goes now.
  // Permanent (308), so a search engine moves the address on instead of
  // keeping a page that is not there, and an old link still lands somewhere.
  // NEVER A SEARCH RESULT, SAID ON THE RESPONSE ITSELF. What is behind sign-in, or is somebody's own (a conversation, a
  // share link, the account, a referral, the team's tools, the API), carries X-Robots-Tag: noindex — on every response,
  // HTML or not, before any page code runs. Signing in is what protects these; this only keeps their addresses out of
  // an index. The pages that render HTML say the same in their own metadata (lib/seo.ts NOINDEX). Kept in step with
  // PRIVATE_PREFIXES in lib/seo.ts, which test/seo.test.mjs checks against this list.
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const prefixes = ['chat', 'account', 'memory', 'onboarding', 'sso-callback', 'studio', 's', 'r', 'dev', 'logos-5-internal', 'logos2-test', 'mind-ar', 'model', 'api'];
    return [
      ...prefixes.flatMap((p) => [
        { source: `/${p}`, headers: noindex },
        { source: `/${p}/:path*`, headers: noindex },
      ]),
      { source: '/events/admin/:path*', headers: noindex },
      { source: '/events/:id/ticket', headers: noindex },
      { source: '/events/:id/checkin', headers: noindex },
    ];
  },
  async redirects() {
    return [
      // The Core 4 model page went with the archived models (docs/ARCHIVE.md);
      // what it described is what Logos 5 runs on.
      { source: '/core4model', destination: '/docs/logos-5', permanent: true },
    ];
  },
};

module.exports = nextConfig;
