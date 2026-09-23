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
    tokens.subscribe,
    () => tokens.get() !== null,
    () => false, // 서버 렌더링에서는 토큰을 알 수 없다. 로그아웃으로 본다
  );

  if (!hasToken) return { me: undefined, resolved: true };
  return { me: query.data, resolved: !query.isPending };
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
    // 순서가 있다. 캐시를 먼저 비우고 토큰을 지운다 —
    // 토큰이 사라졌다는 알림을 받은 화면이 다시 그릴 때 캐시에 옛 사용자가 남아 있으면 안 된다.
    //
    // qc.clear() 만으로는 화면이 안 바뀐다. 캐시에서 쿼리를 **제거**하는 것은 구독자에게
    // 새 결과를 밀어 주지 않아서, 훅은 지워지기 직전의 값을 그대로 들고 있다.
    // 화면을 움직이는 것은 아래 api.logout() 이 일으키는 토큰 알림이다.
    qc.clear();
    // 기다리지 않는다. 화면을 움직이는 것은 토큰 알림이고 그것은 동기적으로 일어난다 —
    // 서버 왕복은 쿠키를 지우러 가는 길일 뿐이다.
    void api.logout().catch((e: unknown) => {
      // 여기서 실패해도 이 브라우저는 이미 로그아웃 상태다(액세스 토큰이 없다).
      // 남는 것은 서버 쪽 쿠키뿐이라 화면에 띄울 것이 없다. 다만 삼키지도 않는다.
      console.error("로그아웃 요청이 서버에 닿지 않았습니다.", e);
    });
  };
}
