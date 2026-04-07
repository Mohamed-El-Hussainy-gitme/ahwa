import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  httpAgentOptions: {
    keepAlive: true,
  },
};

export default nextConfig;
