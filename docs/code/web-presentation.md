# web/src/presentation + web/src/app

> 레이어: presentation · app · 커리큘럼 8.3~8.7 · 짝: `web/src/presentation/**`,
> `web/src/app/**/page.tsx`, `web/src/app/layout.tsx`

## 무엇을 하는 코드인가

화면 전부다. `hooks/` 가 서버 상태를 다루고 `components/` 가 그것을 그리고 `styles/tokens.css` 가
색·활자·간격의 값을 갖는다. `app/**/page.tsx` 는 화면이 아니라 **라우팅 껍데기**다. 이 레이어가 부르는
것은 `composition/container.ts` 의 `api` 하나이고, 그 함수가 GraphQL 로 가는지 REST 로 가는지 모른다.

## 코드를 따라 읽기

### 캐시 키를 한 파일에서 만든다 (8.3)

```ts
all: ["posts"] as const,
list: (params: { limit?: number } & PostFilter = {}) => ["posts", "list", params] as const,
detail: (id: string) => ["posts", "detail", id] as const,
```

`composition/queryKeys.ts` 다. 훅마다 배열을 직접 쓰면 같은 데이터에 `["posts"]` 와 `["post-list"]` 가
동시에 붙고, 무효화할 때 **어떤 키를 지워야 하는지 아무도 모르게 된다.** 모아 두면 `posts.all` 이 `list` 와
`detail` 의 앞부분이라는 사실이 보인다. `list(params)` 가 인자를 키에 넣는 것도 같은 이야기다 — 빼면
`limit=20` 과 `limit=50` 이 같은 자리를 덮어쓴다. 키 파일은 [web-composition.md](./web-composition.md) 에 있다.

### `staleTime` 을 기본값 0 으로 두지 않는다 (8.4)

기본값 `0` 은 "가져오는 즉시 낡았다" 는 뜻이라, 창을 다시 클릭하거나 컴포넌트가 다시 마운트될 때마다
요청이 나간다. `QueryProvider` 가 기본을 `60_000` 으로 올린 근거는 데이터의 성질이다 — 게시판 글 목록이
1분 사이에 달라질 일이 드물다. 상세는 `usePost` 에서 15초로 덮어쓴다. 목록보다 자주 바뀌고 그 원인이 본문이
아니라 **댓글**이기 때문이다. `useMe` 는 5분이다. 세 값의 크기 차이가 곧 "얼마나 자주 바뀌는가" 의 답이다.

### 댓글을 달면 상세와 목록을 둘 다 무효화한다 (8.5)

```ts
qc.invalidateQueries({ queryKey: queryKeys.posts.detail(postId) });
// 목록의 commentCount 도 틀려졌다.
qc.invalidateQueries({ queryKey: queryKeys.posts.all });
```

상세만 지우고 싶어진다. 댓글은 상세 화면의 것이니까. 그런데 목록 항목에도 `commentCount` 가 있다(02-api.md
2.4). 상세만 갱신하면 목록으로 돌아갔을 때 숫자가 하나 모자란 채로 남는다. **기준은 "무엇을 보고 있었나" 가 아니라 "어떤 캐시가 틀려졌나" 다.** 그래서 8.3 이 8.5 보다 먼저다.

### 다음 커서를 서버가 준 값 그대로 쓴다 (8.6)

```ts
getNextPageParam: (last) => last.pageInfo.nextCursor ?? undefined,
```

계산이 없다. 항목 개수를 세지도, 마지막 항목의 id 를 꺼내지도 않는다. 이 한 줄이 계산 없이 맞아떨어지면
2단계에서 목록 응답에 `pageInfo` 를 넣기로 한 설계가 옳았다는 뜻이다. `page`/`offset` 을 같이 열어 두었다면 여기서 무엇을 기준으로 삼을지 고민이 생겼을 것이다.

### 토큰이 없으면 아예 묻지 않는다 (8.7)

`enabled: typeof window !== "undefined" && tokens.get() !== null` 이다. 로그아웃 상태에서 `GET /me` 를
부르면 `401` 이고, 그 `401` 은 정상인데 `useMe` 는 `SiteHeader`·`PostList`·`CommentSection`·`NewPostForm`
네 곳에서 쓰인다 — 실패한 쿼리 하나가 네 화면을 동시에 흔든다. 물어볼 이유가 없는 질문을 안 하는 것이 에러 처리를 잘하는 것보다 낫다. `retry: false` 도 같은 이유다.

### `QueryClient` 는 `useState` 로 만들고, 페이지는 세 줄로 둔다

`useState(() => new QueryClient({ … }))` 다. 모듈 최상단에서 만들면 인스턴스가 모듈 하나당 하나이고,
브라우저에서는 탭 하나에 사용자 하나라 문제가 안 되지만 **서버에서는 그 하나를 모든 요청이 같이 쓴다.**
초기화 함수는 컴포넌트 인스턴스마다 한 번 돌기 때문에 요청끼리 섞이지 않는다.

`posts/[id]/page.tsx` 는 `const { id } = await params` 로 값을 꺼내 `<PostDetail id={id} />` 를 돌려주는 것이 전부다(Next 16 에서 `params` 가 Promise 라 `await` 한다). `"use client"` 는 페이지가 아니라 `presentation` 컴포넌트에 붙어 있다 — 껍데기는 서버 컴포넌트로 두고 경계를 화면 컴포넌트에서 긋는다.

### 컴포넌트가 hex 를 직접 쓰지 않는다

색·활자 크기·폭의 값은 `tokens.css` 에만 있고, 컴포넌트는 `text-[var(--ink)]` 처럼 이름으로 부른다. 이유는
다크 모드다. `@media (prefers-color-scheme: dark)` 에서 토큰만 다시 정의하면 화면 전체가 따라 바뀌지만, 컴포넌트에 `#000` 이 하나라도 박혀 있으면 **거기 한 군데만 안 바뀐다.** 색의 근거는 [05-design.md](../05-design.md) 의 몫이다.

## 왜 이렇게 했는가

**무효화를 좁게 하지 않고 `posts.all` 로 넓게 잡았다.** 바뀐 항목만 손으로 고쳐 넣으면(`setQueryData`)
요청이 줄지만, 무한스크롤로 쌓인 여러 페이지에서 그 항목을 찾아 고치는 코드가 필요하다. 지금 규모에서는 다시 받는 쪽이 싸고 무엇보다 틀릴 데가 없다.

**로그인 성공은 `setQueryData`, 로그아웃은 `qc.clear()` 다.** 로그인 응답에 사용자 정보가 이미 들어 있으므로 한 번 더 물을 이유가 없다. 로그아웃은 반대다 — `me` 만 지우면 이전 사용자가 보던 목록·상세가 캐시에 남고 다음 사람이 그것을 먼저 본다.

**에러 문구는 컴포넌트가 만든다.** `messageOf` 는 `UNAUTHENTICATED` 하나만 화면 말로 갈아입히고
나머지는 서버 `message` 를 그대로 쓴다. "내 글만 삭제할 수 있습니다." 는 이미 사람이 읽을 말이다.

## 8단계에서 무엇이 바뀌었나

### 로그인 여부가 "확정됐는지" 까지 알려 준다

```ts
if (!hasToken) return { me: undefined, resolved: true };
return { me: query.data, resolved: !query.isPending };
```

`useMe` 만으로는 모자랐다. 토큰이 없으면 `enabled: false` 라 쿼리가 영영 `isPending` 이고,
`isPending` 으로 "아직 모른다" 를 판단하던 화면이 **로그아웃한 사람에게 글쓰기 폼을 보여 줬다.**
토큰이 없다는 것은 그 자체로 답이다 — 기다릴 것이 없다. 고친 뒤 로그아웃 상태로 글쓰기 화면을 열면
"글을 쓰려면 로그인해야 합니다." 가 뜨고, 링크가 `/login?returnTo=%2Fposts%2Fnew` 다.

### 401 은 로그인 화면으로, 403 은 보내지 않는다

`useAuthGuard` 는 `isUnauthenticated` 일 때만 `router.push` 하고, `useLoginHref` 가 안내 링크에
돌아올 자리를 싣는다. `LoginForm` 은 그 `returnTo` 를 `/` 로 시작하는 내부 경로일 때만 받는다 —
`returnTo=https://남의사이트` 를 그대로 믿으면 로그인 직후 그리로 보내진다(열린 리다이렉트).

### 삭제를 낙관적으로 한다 (8.5)

`useDeletePost` 에 `onMutate`(캐시에서 먼저 지움) · `onError`(되돌림) · `onSettled`(무효화)가 붙었다.
`getQueriesData` 로 목록 캐시를 **전부** 훑는 것이 핵심이다 — 필터마다 키가 갈려 캐시가 여러 벌이다.
`fetch` 를 가로채 `FORBIDDEN` 을 돌려주자 상세에 "내 글만 삭제할 수 있습니다." 가 뜨고, 목록으로
돌아가니 **글이 그대로 남아 있었다.** 되돌려진 것이다. `403` 이라 로그인 화면으로도 보내지 않았다.

### 무한스크롤 센티넬은 콜백 ref 로 붙인다 (8.6)

`useEffect` 로 옵저버를 한 번만 만들면 그 시점에는 목록이 로딩 중이라 감시할 요소가 없고, 나중에 요소가
붙어도 effect 는 다시 돌지 않아 옵저버가 영영 만들어지지 않는다. 콜백 ref 는 요소가 붙고 떨어질 때마다
불려서 그 문제가 없다. 캐시에서 `fetchNextPage` 를 직접 불러 항목이 **20 → 60**(3페이지)로 쌓이는 것은
확인했다. **IntersectionObserver 가 실제로 발동하는 것은 확인하지 못했다** — 검사한 탭이
`visibilityState: hidden` 이라 콜백이 전달되지 않는다. 같은 노드에 옵저버를 직접 붙여도 타임아웃이어서, 앱이 아니라 환경 문제라는 데까지만 가렸다.

### 검색과 정렬

입력은 300ms 디바운스한다. 한 글자마다 보내면 "인덱스" 를 치는 동안 요청이 세 번 나간다. 정렬은
최신순/오래된 순 토글 하나다. 눌러 보면 첫 글이 "인덱스 하나로 실행 시간이 33배 줄었다" 에서
"미들웨어 순서 이야기 10000" 으로 뒤집힌다. 두 값은 모두 `PostFilter` 로 묶여 `queryKey` 에 들어간다.

## 직접 해 볼 것

1. `useAddComment` 의 `queryKeys.posts.all` 무효화 줄을 지운다. 댓글을 달고 목록으로 돌아가 `댓글 n` 을
   본다. 숫자가 어긋나고, 60초를 기다렸다 오면 맞아진다 — 무효화가 아니라 `staleTime` 이 지나서다.
2. `useDeletePost` 의 `onError` 를 지우고 남의 글을 지워 본다. 목록에서 사라진 글이 돌아오지 않는다.
   **낙관적 업데이트는 되돌리기와 한 쌍이다.**
3. `PostList` 의 `useInfiniteScroll` 을 `useEffect` + `useRef` 로 바꿔 본다. 첫 로딩이 끝난 뒤에
   센티넬이 붙으므로 옵저버가 만들어지지 않고, 스크롤해도 다음 장이 오지 않는다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.7 · 8.7 | **끝났다.** 액세스 토큰은 `localStorage` 에 남아 `useMe` 의 `enabled` 가 그대로 쓰인다. 쿠키로 간 리프레시 토큰은 `401` 재시도가 알아서 쓴다 |
| 7.4 · 8.3 | **끝났다.** `usePostList` 가 `PostFilter` 를 받고 그 값이 `queryKeys.posts.list` 에 들어간다 |
| 8.5 · 8.6 | **끝났다.** 삭제가 낙관적으로 바뀌었고 목록에 `IntersectionObserver` 센티넬이 붙었다 |
| 남은 것 | 댓글 더 보기. `CommentSection` 이 문구로만 남겨 둔 자리이고 `queryKeys.comments.byPost` 는 이미 있다 |
