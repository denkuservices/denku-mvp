import type { NextConfig } from "next";
import path from "path";
import bundleAnalyzer from "@next/bundle-analyzer";
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
  async rewrites() {
    return [
      // Map Horizon asset paths
      {
        source: "/img/:path*",
        destination: "/horizon/img/:path*",
      },
      {
        source: "/fonts/:path*",
        destination: "/horizon/fonts/:path*",
      },
      {
        source: "/svg/:path*",
        destination: "/horizon/svg/:path*",
      },
    ];
  },
  webpack: (config) => {
    // Resolve Horizon absolute imports to src/horizon/*
    config.resolve.alias = {
      ...config.resolve.alias,
      'components': path.resolve(__dirname, 'src/horizon/components'),
      'contexts': path.resolve(__dirname, 'src/horizon/contexts'),
      'variables': path.resolve(__dirname, 'src/horizon/variables'),
      'utils': path.resolve(__dirname, 'src/horizon/utils'),
      'routes': path.resolve(__dirname, 'src/horizon/routes'),
      'styles': path.resolve(__dirname, 'src/horizon/styles'),
    };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);

