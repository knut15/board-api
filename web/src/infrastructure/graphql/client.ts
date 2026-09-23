// 문서: docs/code/web-graphql.md · 레이어: infrastructure (브라우저에서 돈다)
//
// BFF 를 부르는 얇은 클라이언트. 캐시를 갖지 않는다 — 캐시는 TanStack Query 가 맡는다.
// 커리큘럼 8.2 의 "API 클라이언트 한 겹" 이 이 파일이다.
// GraphQL 에러를 DomainError 로 바꾸는 일도 여기서 한 번만 한다.

import { GraphQLClient, ClientError } from "graphql-request";
import { DomainError, type DomainErrorCode } from "@/domain/shared/errors";
import type { TokenStorage } from "@/application/ports/repositories";

const KNOWN: DomainErrorCode[] = [
  "VALIDATION_FAILED",
  "EMAIL_ALREADY_EXISTS",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "POST_NOT_FOUND",
  "COMMENT_NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "INTERNAL_ERROR",
];

export function createGraphqlClient(tokens: TokenStorage, refresh: () => Promise<boolean>) {
  // graphql-request 는 내부에서 new URL(endpoint) 을 부른다. 상대 경로 "/api/graphql" 은
  // base 없이 파싱되지 않아 TypeError 로 죽는다. 그래서 절대 주소로 만든다.
  //
  // 만드는 시점을 첫 요청까지 미룬다. 이 모듈은 서버 렌더링에서도 한 번 읽히는데,
  // 그때는 window 가 없다. 모듈 최상단에서 만들면 페이지가 뜨기 전에 죽는다.
  let client: GraphQLClient | null = null;
  const getClient = () =>
    (client ??= new GraphQLClient(`${window.location.origin}/api/graphql`));

  const send = async <T,>(document: string, variables?: object): Promise<T> => {
    const token = tokens.get();
    return getClient().request<T>(document, variables as never, {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    });
  };

  return async function request<T>(document: string, variables?: object): Promise<T> {
    try {
      return await send<T>(document, variables);
    } catch (e) {
      const err = toDomainError(e);

      // 8.7 — 액세스 토큰은 15분이다. 만료됐다고 곧바로 로그인 화면으로 보내면
      // 15분마다 쫓겨난다. 리프레시 쿠키로 한 번 되살려 보고, 그래도 안 되면 그때 던진다.
      //
      // 딱 한 번만 시도한다. 재발급이 또 401 을 주는 상황에서 다시 시도하면 무한히 돈다.
      if (err.code === "UNAUTHENTICATED" && (await refresh())) {
        try {
          return await send<T>(document, variables);
        } catch (retried) {
          throw toDomainError(retried);
        }
      }
      throw err;
    }
  };
}

function toDomainError(e: unknown): DomainError {
  if (e instanceof ClientError) {
    const raw = e.response.errors?.[0];
    const code = raw?.extensions?.code;
    const known = KNOWN.find((c) => c === code) ?? "INTERNAL_ERROR";
    return new DomainError(known, raw?.message ?? "요청을 처리하지 못했습니다.");
  }
  // 네트워크가 끊긴 경우가 여기다. 서버가 답을 준 것이 아니므로 code 를 지어내지 않는다.
  return new DomainError("INTERNAL_ERROR", "서버에 연결하지 못했습니다.");
}
