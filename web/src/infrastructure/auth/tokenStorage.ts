// 문서: docs/code/web-graphql.md · 레이어: infrastructure

import type { TokenStorage } from "@/application/ports/repositories";

const KEY = "board-api.token";

// 커리큘럼 6.7 에서 httpOnly 쿠키로 옮긴다. localStorage 는 XSS 로 읽힌다 —
// 페이지에 끼어든 스크립트가 있으면 토큰을 그대로 가져간다.
// 3단계의 "토큰" 은 유저 id 라서 애초에 비밀이 아니다. 자리를 먼저 만들어 두는 것이다.

// localStorage 는 **같은 탭에서 바뀔 때 storage 이벤트를 쏘지 않는다.** 쓴 탭은 이미 알
// 것이라고 보기 때문이다. 그래서 같은 탭 몫은 여기서 직접 알린다.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export const browserTokenStorage: TokenStorage = {
  get() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(KEY);
  },
  set(token) {
    window.localStorage.setItem(KEY, token);
    notify();
  },
  clear() {
    window.localStorage.removeItem(KEY);
    notify();
  },
  subscribe(listener) {
    listeners.add(listener);
    // 다른 탭에서 로그아웃하면 이쪽도 따라 내려간다. 이 이벤트는 그 탭에서만 온다.
    window.addEventListener("storage", listener);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", listener);
    };
  },
};
