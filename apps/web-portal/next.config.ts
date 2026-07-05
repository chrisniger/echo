import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@echo-gpt/shared-types', '@echo-gpt/shared-config'],
};

export default nextConfig;
