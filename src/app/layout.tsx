import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "image converter",
  description: "不同在线将JPG、PNG等格式图片转换为其他格式",
  keywords: "converter, image, online tool",
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
