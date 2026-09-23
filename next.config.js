/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The PDF reader (lib/file-extract.ts) is a build of pdf.js made to run
    // as-is on serverless Node. Loaded from node_modules at runtime rather
    // than re-bundled, so production runs exactly what the tests run.
    serverComponentsExternalPackages: ['unpdf'],
  },
};

module.exports = nextConfig;
