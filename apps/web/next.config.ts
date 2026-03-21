import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@calendar-hub/shared'],
};

export default nextConfig;
