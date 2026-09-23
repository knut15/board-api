# web/src/infrastructure — graphql · repository · auth

> 레이어: infrastructure · 커리큘럼 8.2 · 짝: `web/src/infrastructure/graphql/client.ts`,
> `graphql/documents.ts`, `repository/graphqlRepositories.ts`, `auth/tokenStorage.ts`

## 무엇을 하는 코드인가

브라우저에서 BFF(`/api/graphql`)와 말을 주고받는 층이다. 네 파일이 하나씩 맡는다 — 부르는 것
(`client.ts`), 무엇을 물을지(`documents.ts`), 포트 모양으로 맞추는 것(`graphqlRepositories.ts`),
토큰을 두는 곳(`tokenStorage.ts`). `presentation` 은 이 폴더를 import 하지 않고
([04-web-architecture.md](../04-web-architecture.md) 금지 import), 아는 곳은 `composition/container.ts` 하나다.

## 코드를 따라 읽기

### 에러를 DomainError 로 바꾸는 자리가 하나다

```ts
} catch (e) {
  throw toDomainError(e);
}
```

커리큘럼 8.2 의 "API 클라이언트 한 겹" 이 이 `try/catch` 다. 여기를 지나면 바깥에는 `DomainError` 만 나가고,
화면은 `graphql-request` 도 HTTP 상태 코드도 모른 채 `error.code` 만 본다. 이 변환을 컴포넌트마다 하면 같은 `if` 가 화면 수만큼 생긴다.

### `message` 가 아니라 `extensions.code` 로 분기한다

```ts
const code = raw?.extensions?.code;
const known = KNOWN.find((c) => c === code) ?? "INTERNAL_ERROR";
```

`message` 는 사람이 읽는 문구다. 고쳐 쓰고 번역도 하고 말투도 바뀌는데 그때마다 프론트 분기가
깨지면 안 된다. [02-api.md](../02-api.md) 2.4 가 "프론트는 `code` 로 분기한다" 로 못 박은 이유이고,
BFF 쪽 `boardApiClient.ts` 가 REST 에러 봉투의 `error.code` 를 `extensions` 에 실어 약속을 지킨다.
`KNOWN` 은 그 문자열을 `DomainErrorCode` 로 좁히는 허용 목록이다 — 없는 값은 `INTERNAL_ERROR` 다.

### 네트워크가 끊긴 경우에 `code` 를 지어내지 않는다

```ts
// 서버가 답을 준 것이 아니므로 code 를 지어내지 않는다.
return new DomainError("INTERNAL_ERROR", "서버에 연결하지 못했습니다.");
```

`ClientError` 가 아니라는 것은 **응답 자체가 없었다**는 뜻이다. `NETWORK_ERROR` 를 새로 만들면 02-api.md
목록에 없는 값이 프론트에만 생긴다. `INTERNAL_ERROR` 로 두고 구분은 `message` 로만 한다 — 치르는 값은 있다. 진짜 `500` 과 연결 실패가 `code` 로는 같아진다.

### 토큰은 요청할 때마다 읽는다

```ts
const send = async <T,>(document: string, variables?: object): Promise<T> => {
  const token = tokens.get();
  return getClient().request<T>(document, variables as never, {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
};
```

바깥에서 한 번만 읽으면 모듈 로드 시점의 값이 굳는다. 로그인 직후의 요청이 토큰 없이 나가고 `401` 이 된다.
요청 한 번을 `send` 로 떼어 둔 것은 아래 8단계 절의 재시도가 같은 일을 다시 해야 하기 때문이다.

### 목록 쿼리가 `body` 를 요청하지 않는다

```
items { id title author { id nickname } commentCount createdAt }
pageInfo { nextCursor hasNext }
```

02-api.md 2.4 의 "목록 항목에 `body` 를 넣지 않는다" 와 같은 결정인데, GraphQL 에서는 그것이
**쿼리 한 줄로 눈에 보인다.** REST 라면 서버 응답 형태를 고쳐야 할 일을 클라이언트가 필드 목록으로
표현한다. 쿼리를 `documents.ts` 에 모은 것도 같은 이유다 — 어떤 화면이 무엇을 요구하는지 여기서 안다.
리포지터리(`graphqlRepositories.ts`)는 `d.posts` 처럼 쿼리 이름으로 싸인 한 겹을 벗겨
`application/ports/repositories.ts` 의 모양으로 맞추는 일만 한다. 로직은 없다.

## 왜 이렇게 했는가

**`graphql-request` 를 쓰고 Apollo Client 를 쓰지 않는다.** 04 문서 "정한 것" 표의 결정이다.
캐시를 갖지 않는 얇은 fetch 래퍼라서 캐시·무효화·재요청은 전부 TanStack Query 가 맡는다. 역할이
겹치지 않아야 8.3~8.6 의 `queryKey`·`invalidateQueries` 실습이 성립한다.

**에러 코드 목록을 손으로 적어 두었다.** 04 문서가 GraphQL Codegen 을 쓰지 않기로 했으므로 `KNOWN` 은
서버와 손으로 맞춘 목록이다. 서버가 새 코드를 내면 프론트는 조용히 `INTERNAL_ERROR` 로 떨어진다 — 화면이 깨지지는 않지만 분기도 못 한다.

**액세스 토큰을 `localStorage` 에 둔다.** 안전한 선택이 아니다 — XSS 가 있으면 읽힌다. 6.7 에서 쿠키로
옮긴 것은 리프레시 토큰뿐이고, 액세스 토큰은 15분짜리라 만료되면 그 쿠키로 되살린다(아래 8단계 절).

## 8단계에서 무엇이 바뀌었나

**`UNAUTHENTICATED` 를 만나면 한 번만 되살려 본다.** `createGraphqlClient` 가 `refresh` 를 더 받는다.

```ts
if (err.code === "UNAUTHENTICATED" && (await refresh())) {
  try {
    return await send<T>(document, variables);
  } catch (retried) {
    throw toDomainError(retried);
  }
}
throw err;
```

액세스 토큰은 15분이라, 만료될 때마다 로그인 화면으로 보내면 15분마다 쫓겨난다. **요점은 "한 번만" 이다** —
재시도가 `request` 로 다시 들어가게 짜면 그 안에서 또 `401` 을 만나 또 재발급을 부르는 고리가 생긴다.
재시도가 `send` 를 직접 부르는 것이 그 고리를 끊는다. `refresh` 를 인자로 받는 것은 여기서 `authApi` 를
import 하면 두 모듈이 서로를 부르기 때문이고, 잇는 자리는 `composition/container.ts` 다.

**쿼리에 필터 변수가 붙었다.** `POSTS_QUERY` 가 `$sort: PostSort`·`$q`·`$authorId` 를 받고,
`graphqlRepositories` 가 `createdAt:desc` 를 `createdAt_desc` 로 바꿔 보낸다 — BFF 가 되돌린다.
`tokenStorage.ts` 는 그대로다. 쿠키로 간 것은 리프레시 토큰뿐이고 브라우저 JS 는 그것을 보지 못한다.

## 직접 해 볼 것

1. 네트워크를 Offline 으로 바꾸고 목록을 연다("서버에 연결하지 못했습니다."). 되돌린 뒤 이번에는
   **Express 만** 끈다. BFF 가 답하므로 `ClientError` 경로다 — `code` 는 둘 다 `INTERNAL_ERROR` 다.
2. `KNOWN` 에서 `"FORBIDDEN"` 한 줄을 지우고 남의 글에 삭제를 시도한다. `PostDetail` 의
   "내가 쓴 글만 지울 수 있습니다." 분기가 더 이상 타지 않는다 — 허용 목록이 분기의 근거다.
3. `POSTS_QUERY` 의 `items` 에 `body` 를 넣고 목록을 연다. 네트워크 탭에서 응답 크기를
   넣기 전후로 비교한다. 서버 코드는 한 줄도 고치지 않았다.

## 실제로 걸렸던 것 — 상대 경로로는 못 부른다

`new GraphQLClient("/api/graphql")` 로 시작했다가 화면이 "불러오는 중" 에서 멈췄다.
`graphql-request@7.4.0` 은 요청을 만들며 `new URL(endpoint)` 을 부르는데, `new URL("/api/graphql")` 은
base 가 없어 `TypeError: Invalid URL` 로 죽는다. `fetch` 와 달리 `URL` 은 상대 경로를 해석하지 못한다.
그래서 `window.location.origin` 을 붙이고, 만드는 시점도 첫 요청까지 미룬다 — 이 모듈은 서버
렌더링에서도 한 번 읽히고 그때는 `window` 가 없다.

에러가 화면에 안 뜬 이유가 더 흥미롭다. TanStack Query 는 재시도를 이어도 되는지 판단하는
`canContinue()` 에서 **탭이 보이는 상태인지**(`focusManager.isFocused()`)를 본다. 검사하던 탭이
백그라운드라 재시도가 `fetchStatus: "paused"` 로 멈췄고, 에러가 확정되지 않아 컴포넌트는 계속
로딩으로 남았다. **로딩이 끝나지 않을 때는 에러가 없는 것이 아니라 아직 확정되지 않은 것일 수 있다.**

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.4 | **끝났다.** 토큰이 진짜 JWT 가 됐고 `client.ts` 는 그대로였다 — 이미 `Bearer` 로 보내고 있었다 |
| 6.7 · 8.7 | **끝났다.** 다만 쿠키로 간 것은 리프레시 토큰뿐이다. `tokenStorage.ts` 는 액세스 토큰을 계속 `localStorage` 에 두고, 만료는 `refresh` 재시도가 메운다 |
| 7.4 · 8.3 | **끝났다.** `POSTS_QUERY` 에 `sort`·`q`·`authorId` 가 붙었고 `queryKeys.posts.list` 도 같이 늘었다 |
| 스키마가 굳으면 | `KNOWN` 과 손으로 쓴 응답 타입을 코드 생성으로 옮길지 다시 본다(04 문서 "정한 것") |
