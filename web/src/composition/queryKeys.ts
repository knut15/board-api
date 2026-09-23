// 문서: docs/code/web-composition.md · 커리큘럼 8.3
//
// 캐시 키를 한 곳에서 만든다. 흩어 두면 같은 데이터에 다른 키가 붙고,
// 무효화(8.5)가 어떤 키를 지워야 하는지 아무도 모르게 된다.

import type { PostFilter } from "@/application/ports/repositories";

export const queryKeys = {
  posts: {
    all: ["posts"] as const,

    // **필터를 키에 넣는다.** 넣지 않으면 조건이 다른 결과가 같은 자리를 덮어쓴다 —
    // "인덱스" 로 검색한 목록이 전체 목록 자리에 들어앉는다.
    // 7단계에서 sort·q·authorId 가 생기면서 이 규칙이 실제로 필요해졌다.
    list: (params: { limit?: number } & PostFilter = {}) => ["posts", "list", params] as const,

    detail: (id: string) => ["posts", "detail", id] as const,
  },
  comments: {
    byPost: (postId: string) => ["comments", postId] as const,
  },
  me: ["me"] as const,
};
