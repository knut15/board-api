# web/src/app/api/graphql/route.ts

> 레이어: BFF (Next 서버) · 짝: `web/src/app/api/graphql/route.ts`, `web/src/infrastructure/rest/boardApiClient.ts`

## 무엇을 하는 코드인가

브라우저와 Express 사이에 놓인 얇은 한 겹이다. 브라우저가 GraphQL 로 물으면 이 파일이 그 질문을
REST 호출로 바꿔 넘기고 답을 그대로 흘린다. **Next 서버에서만 돈다** — 브라우저는 내려받지 않는다.

```
[브라우저] POST /api/graphql
              │
              ▼
[Next 서버] route.ts — 스키마 + 리졸버
              │  fetch
              ▼
[Express]  REST — 인증 둘(로그인·재발급)만 빼고 전부
```

## 코드를 따라 읽기

### 리졸버는 규칙을 갖지 않는다

```ts
const resolvers = {
  Query: {
    posts: (_, a) => callBoardApi(`/posts${qs({ ...a, sort: a.sort?.replace("_", ":") })}`),
    post: (_, a) => callBoardApi(`/posts/${a.id}`),
    me: (_, __, ctx) => callBoardApi(`/me`, { token: ctx.token }),
  },
```

한 줄짜리다. 권한도 값도 따지지 않는다 — 그 일은 Express 가 한다. 리졸버가 판단을 시작하면
같은 규칙이 두 곳에 생기고, 둘은 반드시 언젠가 어긋난다.

### 토큰은 헤더에서 꺼내 그대로 다시 싣는다

```ts
context: ({ request }): Ctx => ({
  token: request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
}),
```

브라우저가 보낸 `Authorization: Bearer <token>` 에서 값만 꺼내 컨텍스트에 둔다. `callBoardApi` 는
그것을 다시 `Authorization: Bearer` 로 붙여 Express 에 넘긴다. 5단계까지는 이 자리에서
`x-user-id` 로 모양을 바꿨고, 서버가 진짜 JWT 를 받게 되면서 그 변환이 사라졌다.
바꾼 곳은 예고한 대로 `boardApiClient.ts` 한 줄이다.

### 204 와 GraphQL 은 서로 맞지 않는다

```ts
deletePost: async (_, a, ctx) => {
  await callBoardApi(`/posts/${a.id}`, { method: "DELETE", token: ctx.token });
  return true;
},
```

REST 의 삭제는 `204`(바디 없음)로 답하는데 GraphQL 은 필드마다 값을 돌려줘야 해서 `Boolean!` 로 바꾼다.
두 규약이 다른 지점이고 BFF 가 있는 이유이기도 하다. `callBoardApi` 안에서도 `res.status === 204` 를
먼저 걸러 낸다 — `res.json()` 은 빈 본문을 파싱하다 죽는다.

### 에러는 code 를 잃지 않고 건너간다

```ts
throw new GraphQLError(body?.error?.message ?? "요청을 처리하지 못했습니다.", {
  extensions: { code, httpStatus: res.status },
});
```

서버의 에러 봉투(`docs/02-api.md` 2.4)에서 `code` 를 꺼내 `extensions` 에 싣는다.
GraphQL 은 상태 코드를 쓰지 않으므로(성공도 실패도 HTTP 200 이다), `code` 가 유일한 단서다.
화면은 이 값으로 분기한다 — `401` 이면 로그인 화면으로, `403` 이면 보내지 않는다.

`httpStatus` 를 같이 싣는 것은 디버깅용이다. 화면이 이 값으로 분기하면 BFF 가 REST 위에 있다는 사실이 새어 나간다.

### 빈 쿼리 파라미터를 빼는 도우미

```ts
const qs = (params) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  return entries.length ? `?${new URLSearchParams(entries)}` : "";
};
```

`cursor` 가 없을 때 `?cursor=` 를 붙이면 서버는 빈 문자열을 받는다. `limit` 은 더 분명하다 —
`Number("")` 은 `0` 이고 서버의 범위 검사에 걸려 `400` 이다. 값이 없으면 아예 보내지 않는다.

## 왜 이렇게 했는가

**GraphQL 을 서버가 아니라 Next 안에 뒀다.** 학습 축이 REST 라서다 — 상태 코드 규약, 멱등성,
커서 페이지네이션이 모두 REST 를 배우려고 만든 장치다. 서버를 GraphQL 로 바꾸면 그 축이 사라진다. BFF 로 두면 1~7단계가 그대로 살고 스키마 설계·리졸버라는
주제가 하나 붙는다. 대신 **같은 데이터를 두 번 정의**한다 — `server/openapi.yaml` 과 이 파일의
`typeDefs` 를 맞추는 일이 값으로 치르는 비용이다.

**CORS 가 필요 없어졌다.** 브라우저는 자기가 받은 페이지와 같은 출처(`/api/graphql`)로만 요청한다.
Express 를 직접 부르지 않으므로 교차 출처가 생기지 않는다. 8.1 의 CORS 실습은 브라우저가
Express 를 직접 부를 때 필요한 것이고, 이 구조에는 그 경로가 없다.

**스키마를 SDL 문자열로 손으로 썼다.** 코드 생성(GraphQL Codegen)을 붙이지 않았다.
도구가 하나 늘고, 스키마가 자주 바뀌는 초반에는 생성물이 잡음이 된다. 스키마가 굳으면 다시 본다.

## 8단계에서 무엇이 바뀌었나

**스키마에 필터가 붙었다.** `posts` 인자가 둘에서 `sort`·`q`·`authorId` 를 더해 다섯이 됐다.
정렬 값은 `PostSort` enum 이다 — GraphQL enum 은 이름에 콜론을 못 써서
`createdAt_desc` 로 받고, 리졸버가 `_` 를 `:` 로 되돌려 REST 가 아는 `createdAt:desc` 로 보낸다.
**스키마 두 벌을 맞추는 비용이 이런 모양으로 나타난다.** 전달은 실제로 확인했다 —
`sort: createdAt_asc` 는 가장 오래된 글부터 주고, `q: "인덱스"` 는 제목에 그 말이 든 글만 준다.

**헤더가 `x-user-id` 에서 `Authorization: Bearer` 로 바뀌었다.** 6단계에서 예고한 한 줄이고,
바뀐 곳도 `boardApiClient.ts` 그 한 줄뿐이다. 리졸버도 스키마도 화면도 그대로다.

**인증만 GraphQL 밖으로 나갔다.** 로그인과 재발급은 쿠키를 다뤄야 해서 `/api/auth/*` REST 를 쓴다.
[web-auth-proxy.md](./web-auth-proxy.md) 가 그 한 겹을 설명한다. 나머지는 전부 여기를 지난다.

**CORS 가 실제로 없다는 것을 확인했다.** 페이지에서 `fetch('http://localhost:4000/posts')` 를
부르면 `Failed to fetch` 로 막히고, 같은 출처인 `/api/graphql` 은 `200` 이다. Express 응답에
`Access-Control-Allow-Origin` 헤더는 0건이다 — 붙이지 않았고 붙일 필요도 없다.

## 직접 해 볼 것

1. `http://localhost:3000/api/graphql` 을 브라우저로 연다. Yoga 가 GraphiQL 을 띄운다.
   `{ posts(limit: 2) { items { title } } }` 를 실행하고, 필드를 하나씩 지워 보며
   응답이 따라 줄어드는 것을 본다. REST 로는 할 수 없는 일이다.
2. `deletePost` 리졸버의 `return true` 를 지운다. 스키마가 `Boolean!` 을 약속했으므로
   GraphQL 이 어떤 에러를 내는지 확인한다.
3. 목록 쿼리에서 `author { nickname }` 을 빼고 실행한다. **BFF 는 여전히 REST 에서
   작성자를 받아 온다** — 필드를 줄여도 서버 쪽 일이 줄지 않는다는 것을 확인한다.
   이것이 BFF 를 얹은 구조의 한계이고, 서버가 GraphQL 이면 달라지는 지점이다.
4. `PostSort` 를 `createdAt:desc` 처럼 콜론이 든 이름으로 바꿔 본다. 스키마를 만들 때
   이름 규칙에 걸려 죽는다 — 리졸버의 `replace` 가 왜 있는지가 여기서 보인다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.4 | **끝났다.** 서버가 JWT 를 받으면서 `x-user-id` 변환이 사라졌다 |
| 6.7 · 8.7 | **끝났다.** 쿠키를 다루는 경로는 GraphQL 이 아니라 `/api/auth/*` 로 갈라졌다 |
| 7.4 · 8.3 | **끝났다.** `typeDefs` 의 `posts` 인자에 `sort`·`q`·`authorId` 가 붙었다 |
| 9.3 | 배포하면 `BOARD_API_URL` 이 로컬 주소가 아니게 된다. 9.1 의 환경변수 검증 대상 |
