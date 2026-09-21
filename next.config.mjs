/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Webhook handlers must never be statically optimised.
    serverActions: { bodySizeLimit: '1mb' },
  },
};

export default nextConfig;
