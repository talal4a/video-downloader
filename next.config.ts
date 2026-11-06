import type { NextConfig } from 'next';

// The UI is exported as static files and loaded by the Electron app (app://local/).
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  devIndicators: false,
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
