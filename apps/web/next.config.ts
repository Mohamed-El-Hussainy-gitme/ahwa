import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactCompiler: true,
  httpAgentOptions: {
    keepAlive: true,
  },
};

export default nextConfig;
