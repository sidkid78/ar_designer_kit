import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't use static export - we have dynamic routes
  // Capacitor will use live reload during development
  
  // Disable image optimization for Capacitor compatibility
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
