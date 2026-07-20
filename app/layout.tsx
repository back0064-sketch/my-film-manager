import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "影視製片控制台",
  description: "管理影視專案進度與款項。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
