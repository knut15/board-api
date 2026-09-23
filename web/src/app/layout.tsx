// 문서: docs/code/web-presentation.md · 레이어: app (라우팅 껍데기)

import type { Metadata } from "next";
import { Hahmlet, Gothic_A1 } from "next/font/google";
import { QueryProvider } from "@/presentation/components/QueryProvider";
import { SiteHeader } from "@/presentation/components/SiteHeader";
import "./globals.css";

// 읽는 글은 세리프로, 조작하는 것은 산세리프로. 역할이 다르면 활자도 다르다.
const hahmlet = Hahmlet({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-hahmlet",
  display: "swap",
});

const gothicA1 = Gothic_A1({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-gothic-a1",
  display: "swap",
});

export const metadata: Metadata = {
  title: "게시판",
  description: "글을 읽고 씁니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${hahmlet.variable} ${gothicA1.variable}`}>
      <body>
        <QueryProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-[var(--page)] px-6 pb-24">{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
