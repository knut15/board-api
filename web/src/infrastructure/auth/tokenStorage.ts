// 문서: docs/code/web-graphql.md · 레이어: infrastructure

import type { TokenStorage } from "@/application/ports/repositories";

const KEY = "board-api.token";

// 커리큘럼 6.7 에서 httpOnly 쿠키로 옮긴다. localStorage 는 XSS 로 읽힌다 —
// 페이지에 끼어든 스크립트가 있으면 토큰을 그대로 가져간다.
// 3단계의 "토큰" 은 유저 id 라서 애초에 비밀이 아니다. 자리를 먼저 만들어 두는 것이다.
export const browserTokenStorage: TokenStorage = {
  get() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(KEY);
  },
  set(token) {
    window.localStorage.setItem(KEY, token);
  },
  clear() {
    window.localStorage.removeItem(KEY);
  },
};
