import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Phone photos are 2-6 MB; the upload limit itself (10 MB) is enforced in saveImage.
    serverActions: { bodySizeLimit: "11mb" },
  },
};

export default nextConfig;
