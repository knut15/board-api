// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { User } from "@/domain/user/entity";
import { api, tokens } from "@/composition/container";
import { queryKeys } from "@/composition/queryKeys";

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api.getMe(),
    // 토큰이 없으면 아예 묻지 않는다. 물어 봐야 401 이고, 그 401 이 화면을 흔든다.
    enabled: typeof window !== "undefined" && tokens.get() !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

// 로그인 여부가 **확정됐는지**까지 알려 준다.
//
// useMe 만으로는 모자랐다. 토큰이 없으면 enabled: false 라 쿼리가 영영 pending 이고,
// isPending 으로 "아직 모른다" 를 판단하던 화면은 로그아웃한 사람에게 글쓰기 폼을 보여 줬다.
// 토큰이 없다는 것은 그 자체로 답이다 — 기다릴 것이 없다.
export function useViewer(): { me: User | undefined; resolved: boolean } {
  const query = useMe();
  const hasToken = useSyncExternalStore(
    subscribeToToken,
    () => tokens.get() !== null,
    () => false, // 서버 렌더링에서는 토큰을 알 수 없다. 로그아웃으로 본다
  );

  if (!hasToken) return { me: undefined, resolved: true };
  return { me: query.data, resolved: !query.isPending };
}

// localStorage 는 같은 탭에서 바뀔 때 이벤트를 쏘지 않는다.
// 로그인·로그아웃은 화면을 다시 그리게 만드는 다른 경로(쿼리 캐시)가 있어서
// 여기서는 다른 탭의 변경만 듣는다.
function subscribeToToken(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.login,
    onSuccess: (user) => {
      qc.setQueryData(queryKeys.me, user);
    },
  });
}

export function useSignup() {
  return useMutation({ mutationFn: api.signup });
}

export function useLogout() {
  const qc = useQueryClient();
  return () => {
    api.logout();
    qc.clear();
  };
}
