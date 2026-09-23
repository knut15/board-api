import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 커리큘럼 9.2 · 9.3 — 배포용 자립 실행본을 만든다.
  // .next/standalone 에 server.js 와 필요한 node_modules 만 추려 담긴다.
  // 이게 없으면 이미지에 워크스페이스 전체를 넣어야 한다.
  output: "standalone",

  // 모노레포라 추적 기준점을 레포 루트로 잡아 준다.
  // 기본값(web/)으로 두면 루트의 pnpm 심링크를 따라가지 못해 모듈이 빠진다.
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  /* config options here */
};

export default nextConfig;
