// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState 로 한 번만 만든다. 모듈 최상단에서 만들면 서버에서 요청끼리 캐시를 공유한다.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 커리큘럼 8.4 — 기본값 0 으로 두지 않는다. 게시판 글은 1분 안에 거의 안 바뀐다.
            // 화면별로 다르게 쓸 값은 각 훅에서 덮어쓴다.
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
