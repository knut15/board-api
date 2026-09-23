// 문서: docs/code/web-presentation.md · 커리큘럼 8.7
//
// 401 과 403 을 화면 행동으로 옮긴다. 이 구분이 무너지면 사용자가 로그인 화면을 맴돈다.
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";
import { DomainError, isUnauthenticated } from "@/domain/shared/errors";

export function useAuthGuard() {
  const router = useRouter();
  const pathname = usePathname();

  // 401 이면 로그인 화면으로 보내고, 돌아올 자리를 들려 보낸다.
  // 403 은 보내지 않는다 — 다시 로그인해도 남의 글을 고칠 수 있게 되지는 않는다.
  const handle = useCallback(
    (error: unknown): boolean => {
      if (isUnauthenticated(error)) {
        router.push(`/login?returnTo=${encodeURIComponent(pathname)}`);
        return true;
      }
      return false;
    },
    [router, pathname],
  );

  return handle;
}

// 에러를 화면 문구로 바꾼다. 도메인 에러는 사람이 읽을 메시지를 이미 갖고 있으므로
// 뜻이 달라지는 것만 갈아입힌다.
export function messageOf(error: unknown, fallback = "요청을 처리하지 못했습니다."): string {
  if (isUnauthenticated(error)) return "다시 로그인해 주세요.";
  // 403 을 포함한 나머지 도메인 에러는 서버가 준 문구를 그대로 쓴다.
  // "내 글만 지울 수 있습니다." 처럼 이미 사람이 읽을 말이다.
  if (error instanceof DomainError) return error.message;
  return fallback;
}
