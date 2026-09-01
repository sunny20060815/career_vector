import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/chat": [
      "./data/02_关系表/08_AI技能共现关系表.csv",
      "./data/02_关系表/09_专业培养方案主表.csv",
      "./data/02_关系表/10_专业技能关系表.csv",
      "./data/02_关系表/11_职业大典职业明细表.csv"
    ]
  }
};

export default nextConfig;
