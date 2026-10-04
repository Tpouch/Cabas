import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Phone photos are 2-6 MB; the upload limit itself (10 MB) is enforced in saveImage.
    serverActions: { bodySizeLimit: "11mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ production: process.env.NODE_ENV === "production" }) }];
  },
};

export default nextConfig;
