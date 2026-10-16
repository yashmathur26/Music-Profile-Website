/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The site never uses next/image. Self-hosted (Railway), the optimizer
  // endpoint would still be public and has open DoS advisories on 14.x —
  // this makes /_next/image a 404 before it does any work.
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    },
    // Boot hook for the built-in scheduler on long-lived hosts (Railway).
    instrumentationHook: true,
    // Reads its country table from node_modules at runtime, so it can't be bundled.
    serverComponentsExternalPackages: ["geoip-country"]
  },
  typescript: {
    // Allow build to continue even with type errors (for now)
    ignoreBuildErrors: true,
  },
  eslint: {
    // Allow build to continue even with lint errors (for now)
    ignoreDuringBuilds: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "encrypted-media=(self \"https://w.soundcloud.com\")",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
