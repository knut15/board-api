// 문서: docs/code/web-presentation.md · 커리큘럼 8.7
//
// 로그인 화면으로 보내는 링크는 언제나 돌아올 자리를 들고 간다.
//
// 8단계에서 알게 된 것: 401 을 받아 리다이렉트하는 경로는 거의 타지 않는다.
// me 조회가 먼저 401 을 맞아 화면이 "로그인해야 합니다" 안내로 바뀌기 때문이다.
// 그래서 **돌아올 자리를 실어 주는 일은 그 안내의 링크가 해야 한다.**

"use client";

import { usePathname } from "next/navigation";

export function useLoginHref(): string {
  const pathname = usePathname();
  return pathname === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(pathname)}`;
}
