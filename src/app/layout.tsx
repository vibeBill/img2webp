import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WebP图片转换器",
  description: "在线将JPG、PNG等格式图片转换为WebP格式",
  keywords: "webp, converter, image, online tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
