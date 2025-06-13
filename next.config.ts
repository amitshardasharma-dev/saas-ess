import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'hr.portal',
        port: '8000',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'hr.portal',
        port: '8000',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
