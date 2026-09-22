import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep `next dev` artifacts separate from production build output. Reusing
  // `.next` after `next build` can leave route manifests inconsistent while
  // the development server is compiling API routes.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
};

export default nextConfig;
