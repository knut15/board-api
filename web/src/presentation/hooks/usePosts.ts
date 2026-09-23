// 문서: docs/code/web-presentation.md · 레이어: presentation · 커리큘럼 8.3~8.6
"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/composition/container";
import { queryKeys } from "@/composition/queryKeys";
import type { PostFilter } from "@/application/ports/repositories";
import type { Page, PostSummary } from "@/domain/post/entity";

const PAGE = 20;

export function usePostList(filter: PostFilter = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.posts.list({ limit: PAGE, ...filter }),
    queryFn: ({ pageParam }) => api.listPosts({ limit: PAGE, cursor: pageParam, ...filter }),
    initialPageParam: undefined as string | undefined,
    // 서버가 주는 pageInfo.nextCursor 를 그대로 다음 요청에 넣는다.
    // 이 한 줄이 맞아떨어지면 2단계의 목록 응답 설계가 옳았다는 뜻이다(커리큘럼 8.6).
    getNextPageParam: (last) => last.pageInfo.nextCursor ?? undefined,
  });
}

export function usePost(id: string) {
  return useQuery({
    queryKey: queryKeys.posts.detail(id),
    queryFn: () => api.getPost(id),
    // 상세는 목록보다 자주 바뀐다. 댓글이 달리기 때문이다.
    staleTime: 15_000,
  });
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPost,
    onSuccess: () => {
      // 새 글이 목록 맨 위에 와야 하므로 목록 계열 전체를 무효화한다(8.5).
      qc.invalidateQueries({ queryKey: queryKeys.posts.all });
    },
  });
}

export function useAddComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.addComment({ postId, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
      // 목록의 commentCount 도 틀려졌다. 상세만 갱신하면 목록으로 돌아갔을 때 숫자가 어긋난다.
      qc.invalidateQueries({ queryKey: queryKeys.posts.all });
    },
  });
}

type ListCache = { pages: Page<PostSummary>[]; pageParams: unknown[] };

// 8.5 — 낙관적 업데이트는 삭제 하나에만 적용한다.
//
// 삭제를 고른 이유가 있다. 결과를 미리 그릴 수 있고(그 줄이 사라진다),
// 되돌리는 것도 분명하다(원래 자리에 다시 넣는다). 글 작성은 서버가 만든 id 가 있어야
// 화면을 제대로 그릴 수 있어서 미리 그리기가 어렵다.
export function useDeletePost() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: api.deletePost,

    async onMutate(id: string) {
      // 돌고 있는 목록 요청이 있으면 취소한다. 안 그러면 방금 지운 글을 담은
      // 예전 응답이 뒤늦게 도착해 낙관적 업데이트를 덮어쓴다.
      await qc.cancelQueries({ queryKey: queryKeys.posts.all });

      // 되돌릴 때 쓸 사본. 필터별로 캐시가 여러 벌이라 전부 챙긴다.
      const snapshot = qc.getQueriesData<ListCache>({ queryKey: queryKeys.posts.all });

      for (const [key, cache] of snapshot) {
        if (!cache?.pages) continue;
        qc.setQueryData<ListCache>(key, {
          ...cache,
          pages: cache.pages.map((page) => ({
            ...page,
            items: page.items.filter((p) => p.id !== id),
          })),
        });
      }
      return { snapshot };
    },

    onError(_err, _id, ctx) {
      // 서버가 거부했다(남의 글이거나 이미 지워졌거나). 화면을 원래대로 되돌린다.
      for (const [key, cache] of ctx?.snapshot ?? []) qc.setQueryData(key, cache);
    },

    onSettled() {
      // 성공했든 되돌렸든 서버 상태를 한 번 다시 받아 맞춘다.
      qc.invalidateQueries({ queryKey: queryKeys.posts.all });
    },
  });
}
