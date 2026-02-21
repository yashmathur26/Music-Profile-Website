/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
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
