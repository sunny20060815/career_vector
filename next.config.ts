import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/chat": [
      "./data/02_关系表/*.csv"
    ]
  }
};

export default nextConfig;
