import type { Metadata } from "next";
import { Inter, Noto_Sans_SC } from "next/font/google";
import { LocaleProvider } from "@/components/providers/LocaleProvider";
import { AuthProvider } from "@/context/AuthContext";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sc",
});

export const metadata: Metadata = {
  title: "Symbiosis Lab — 实验室资源管理",
  description: "Instrument & animal resource management platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${inter.variable} ${notoSc.variable} font-sans`}>
        <LocaleProvider>
          <AuthProvider>{children}</AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
