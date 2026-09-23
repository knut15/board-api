# web/src/composition

> 레이어: composition · 짝: `web/src/composition/container.ts`, `web/src/composition/queryKeys.ts`

## 무엇을 하는 레이어인가

조립 지점이다. **infrastructure 를 아는 유일한 곳**이고, 그래서 다른 레이어가
서로를 모르고도 돌아간다. 레이어를 나눠 놓으면 언젠가 누군가는 둘을 이어야 하는데,
그 일을 아무 데서나 하면 경계가 슬그머니 사라진다. 한 파일로 못 박아 둔다.

## 코드를 따라 읽기

```ts
const request = createGraphqlClient(browserTokenStorage, refresh);
const posts = createPostRepository(request);
const comments = createCommentRepository(request);
const auth = createAuthGateway(request);

export const api = {
  listPosts: postUseCase.listPosts(posts),
  createPost: postUseCase.createPost(posts),
  login: authUseCase.login(auth, browserTokenStorage),
  …
};
```

위에서 아래로 한 번만 읽으면 된다 — 클라이언트를 만들고, 그것으로 리포지터리를 만들고,
리포지터리를 유스케이스에 꽂는다. 화면은 `api.listPosts()` 만 부르고 그 아래를 모른다.

바꿔 말하면, **GraphQL 을 걷어내고 REST 를 직접 부르기로 해도 고칠 파일은 이 하나다.**
`createPostRepository(request)` 자리에 `createRestPostRepository(fetch)` 를 넣으면 끝난다.
그 교체가 쉬운지 어려운지가 레이어를 나눈 값을 재는 가장 정직한 기준이다.

### queryKeys — 캐시 주소록

```ts
export const queryKeys = {
  posts: {
    all: ["posts"] as const,
    list: (params: { limit?: number } & PostFilter = {}) => ["posts", "list", params] as const,
    detail: (id: string) => ["posts", "detail", id] as const,
  },
  …
};
```

커리큘럼 8.3 이 요구하는 것이다. 키를 컴포넌트마다 손으로 적으면 두 가지가 반드시 일어난다.

1. 같은 데이터에 다른 키가 붙어 캐시가 두 벌이 된다.
2. 무효화할 때 어떤 키를 지워야 하는지 아무도 모른다.

`all` 을 따로 둔 이유가 두 번째다. 글을 쓰거나 댓글을 달면
`invalidateQueries({ queryKey: queryKeys.posts.all })` 한 줄로 목록 계열 전체를 무효화한다.
TanStack Query 는 키를 앞에서부터 맞춰 보므로 `["posts"]` 는 `["posts","list",…]` 와
`["posts","detail",…]` 을 모두 포함한다.

`as const` 를 붙이는 것도 실수를 줄이는 장치다. 키가 리터럴 튜플 타입이 되어
오타가 나면 훅에서 타입이 어긋난다.

### 필터를 키에 넣는다

`list: (params) => ["posts", "list", params]` 처럼 파라미터가 키의 일부다.
넣지 않으면 조건이 다른 결과가 같은 자리를 덮어쓴다 — 검색어 "리액트" 의 결과가
전체 목록 자리에 들어앉는 식이다. 7단계에서 `sort`·`q`·`authorId` 가 생기면서 이 규칙이 실제로
필요해졌고, 타입도 `PostFilter`(`application/ports/repositories.ts`)를 그대로 받는다.

## 왜 이렇게 했는가

**DI 컨테이너 라이브러리를 쓰지 않았다.** 객체 몇 개를 순서대로 만드는 일이라
`new Container().bind(...)` 같은 장치가 없어도 된다. 의존이 늘어 이 파일을 읽기 어려워지는 날
다시 본다. 지금 도입하면 배우는 사람이 "레이어를 나누려면 라이브러리가 필요하다" 고 오해한다.

**모듈 최상단에서 한 번 만든다.** 브라우저에서만 쓰이는 조립이라 요청마다 새로 만들 이유가 없다.
서버 컴포넌트에서 이 파일을 import 하면 `localStorage` 를 건드려 깨진다 — 그래서
`tokenStorage` 가 `typeof window === "undefined"` 를 먼저 본다. 이 조립을 서버에서도 쓰려면
컨테이너를 함수로 바꿔 요청마다 만들어야 한다.

**`tokens` 를 따로 내보낸다.** `useMe` 훅이 "토큰이 있을 때만 물어본다" 를 판단해야 하는데,
그 하나 때문에 유스케이스를 만들기보다 저장소를 그대로 노출하는 쪽이 짧다.
포트 타입(`TokenStorage`)으로 노출하므로 화면은 여전히 `localStorage` 를 모른다.

## 8단계에서 무엇이 바뀌었나

**재발급 배선이 여기로 왔다.** GraphQL 클라이언트가 `401` 을 만나면 스스로 재발급을 한 번 부르는데
([web-graphql.md](./web-graphql.md)), 그 함수를 만들어 꽂는 자리가 이 파일이다.

```ts
const refresh = async (): Promise<boolean> => {
  try {
    const { token } = await refreshRequest();
    browserTokenStorage.set(token);
    return true;
  } catch {
    browserTokenStorage.clear();
    return false;
  }
};
```

클라이언트가 `authApi` 를 직접 import 하면 두 모듈이 서로를 부른다. **서로를 아는 두 모듈을 만들지 않고,
둘 다 모르는 제삼자가 잇는다** — 조립 지점을 한 곳에 둔 값이 여기서 나온다. 실패하면 토큰을 지우고
`false` 를 돌려주므로, 클라이언트는 "되살렸다/못 되살렸다" 만 알면 된다.

**`queryKeys.posts.list` 가 `PostFilter` 를 받는다.** 필터가 키로 갈라지는지 실제로 확인했다 —
검색어를 치는 동안 캐시 키가 `{"limit":20,"sort":"createdAt:desc"}` 와
`{"limit":20,"sort":"createdAt:desc","q":"argon2"}` 둘로 갈렸고, 정렬을 토글하니
`{"sort":"createdAt:asc"}` 로 또 갈렸다. **키가 갈리면 캐시가 여러 벌이 된다** — 낙관적 삭제가
`getQueriesData` 로 전부 훑어야 하는 이유가 이것이다([web-presentation.md](./web-presentation.md)).

## 직접 해 볼 것

1. `queryKeys.posts.all` 을 `["post"]`(단수)로 바꾼다. 글을 새로 써 보면 목록이
   갱신되지 않는다 — 무효화가 아무 키도 맞히지 못했기 때문이다. 캐시 키가 문자열 약속일 뿐이라는 것을 본다.
2. `container.ts` 의 `createPostRepository(request)` 를 주석 처리하고 가짜 구현을 넣는다.
   ```ts
   const posts = { list: async () => ({ items: [], pageInfo: { nextCursor: null, hasNext: false } }), … };
   ```
   화면이 그대로 뜨는지 확인한다. 서버 없이 화면을 개발할 수 있다는 뜻이고, 포트를 둔 값이 여기서 나온다.
3. `presentation` 의 컴포넌트에서 `@/infrastructure/...` 를 직접 import 해 본다.
   `pnpm --filter board-api-web lint` 가 막는다(`web/eslint.config.mjs`).

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.7 · 8.7 | **끝났다.** 다만 쿠키로 간 것은 리프레시 토큰뿐이라 `browserTokenStorage` 는 그대로다. 대신 `refresh` 배선이 늘었다 |
| 7.4 · 8.3 | **끝났다.** `queryKeys.posts.list` 가 `PostFilter` 를 받는다 |
| 9.x | 서버 컴포넌트에서 데이터를 미리 받아 넘기려면 컨테이너를 함수로 바꿔 요청마다 만든다 |
