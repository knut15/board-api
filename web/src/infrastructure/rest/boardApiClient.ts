// 문서: docs/code/web-bff.md · 레이어: infrastructure (Next 서버에서만 돈다)
//
// BFF 리졸버가 Express 를 부를 때 쓰는 어댑터. 브라우저는 이 파일을 실행하지 않는다.
// 서버의 에러 봉투(docs/02-api.md 2.4)를 GraphQLError 로 옮기는 곳이 여기다.

import { GraphQLError } from "graphql";

const BASE = process.env.BOARD_API_URL ?? "http://localhost:4000";

type ErrorBody = { error: { code: string; message: string; details: unknown } };

export async function callBoardApi<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      // 6단계에서 서버가 JWT 를 받게 되면서 이 한 줄이 바뀌었다.
      // 예고한 대로 고친 곳은 여기뿐이다 — 리졸버도 스키마도 화면도 그대로다.
      ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  // 204 는 바디가 없다. res.json() 을 부르면 파싱 에러가 난다.
  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const body = json as ErrorBody | null;
    const code = body?.error?.code ?? "INTERNAL_ERROR";
    // message 가 아니라 code 를 extensions 에 실어 보낸다. 화면은 code 로 분기한다.
    throw new GraphQLError(body?.error?.message ?? "요청을 처리하지 못했습니다.", {
      extensions: { code, httpStatus: res.status },
    });
  }

  return json as T;
}
