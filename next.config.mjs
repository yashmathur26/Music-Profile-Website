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
};

export default nextConfig;
