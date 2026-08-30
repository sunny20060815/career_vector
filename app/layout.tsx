import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "职向量 | 职业数据问答",
  description: "基于招聘聚合数据的职业方向、城市与技能建议。"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
