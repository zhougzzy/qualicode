import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QualiCode",
  description: "面向心理学访谈质性研究的 AI 辅助编码工具",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
