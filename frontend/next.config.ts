import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't use static export - we have dynamic routes
  // Capacitor will use live reload during development
  
  // Allow cross-origin requests from Capacitor on mobile devices
  allowedDevOrigins: [
    "192.168.18.3",
    "192.168.18.13",
    "localhost",
  ],
  
  // Disable image optimization for Capacitor compatibility
  images: {
    unoptimized: true,
  },

  // Transpile React Three packages for React 19 compatibility
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-three/xr',
  ],
};

export default nextConfig;
