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
  async redirects() {
    return [
      // The Core 4 model page went with the archived models (docs/ARCHIVE.md);
      // what it described is what Logos 5 runs on.
      { source: '/core4model', destination: '/docs/logos-5', permanent: true },
    ];
  },
};

module.exports = nextConfig;
