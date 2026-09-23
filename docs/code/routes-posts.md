# server/src/routes/posts.ts

> 커리큘럼 3.5 · 3.6 · 4.5 · 5.2 · 7.5 · 짝: `server/src/routes/posts.ts`

## 무엇을 하는 파일인가

글 목록 · 작성 · 상세 · 수정 · 삭제. `docs/02-api.md` 2.2 표의 4·5·6·7·8번이다. 명세 표의 상태 코드를
옮겨 적은 것에 가깝다. 5단계 뒤로 남은 것은 셋뿐이다 — 저장소 호출, 소유권 판단, 성공 응답.

## 코드를 따라 읽기

### 목록 핸들러는 넘기기만 한다

```ts
postsRouter.get("/", validate({ query: ListPostsQuery }), async (req, res) => {
  const { limit = DEFAULT_LIMIT, cursor, sort, q, authorId } = validQuery<ListPostsQuery>(req);

  const page = await posts.findMany({ limit, cursor, sort, q, authorId });
  res.json(listView({ ...page, items: page.items.map(postListItemView) }));
});
```

7단계에서 받는 값이 둘에서 다섯으로 늘었는데 핸들러에 `if` 는 하나도 안 늘었다 — 값이 허용 목록 안인지는
스키마가 보고, 질의는 저장소가 만든다. `map` 자리의 `await Promise.all(...)` 이 사라진 것은
`postListItemView` 가 더 이상 `async` 가 아니라서다(7.7).

### 쿼리 파라미터는 항상 문자열이다

핸들러는 이미 숫자가 된 값을 받고, 문자열이 숫자로 바뀌는 자리는 스키마다.

```ts
const intFromQuery = (min: number, max: number) =>          // schemas/index.ts
  z.string().regex(/^\d+$/, "정수여야 합니다.")
   .transform(Number)
   .refine((n) => n >= min && n <= max, `${min} 이상 ${max} 이하여야 합니다.`);
```

프론트가 `?limit=20` 으로 보낸 `20` 은 서버에서 문자열 `"20"` 이다. `z.coerce.number()` 로 끝내지 않은
이유는 `coerce` 가 `""` 를 `0` 으로 바꿔 통과시키기 때문이다. **문자열인지 먼저 보고**(`regex`)
바꾸고(`transform`) 범위를 본다(`refine`). 검증이 미들웨어에서 끝나므로 `limit=999` 는 쿼리를 안 낸다.

### 존재 검사가 권한 검사보다 먼저다

```ts
const post = await posts.findById(id);
if (!post) throw postNotFound();
if (post.authorId !== req.user!.id) throw new ForbiddenError("내 글만 수정할 수 있습니다.");
```

순서를 바꾸면 없는 글에 `403` 이 나간다. 없는 글에는 소유자가 없으므로 권한을 말할 근거가 없다.
`docs/02-api.md` 2.5 에서 정했고 세 핸들러가 모두 이 순서를 지킨다. `await` 는 첫 줄에만 붙는다 — 소유권 판정은 손에 든 `post` 만 본다. `postNotFound()` 는 `server/src/errors.ts` 의 공장 함수이고, 같은 뜻의 `404` 를 여러 곳에서 다른 메시지로 만들지 않으려고 묶었다. `req.user!` 의 `!` 는 `requireAuth` 가 보장하는 사실을 타입에 알려 주는 것이다 — 타입은 미들웨어를 모른다.

### PATCH 는 안 보낸 필드를 건드리지 않는다

`UpdatePostBody`(`schemas/index.ts`)의 `.partial()` 이 모든 필드를 `undefined` 허용으로 바꾸고 `refine` 이 "아무것도 안 보낸 PATCH" 를 막는다. 작성과 수정이 한 정의에서 나오므로 길이 상한이 갈라지지 않는다. `PUT` 이라면 반대로 안 보낸 필드를 비워야 한다 — 그래서 이 프로젝트에 `PUT` 이 없다(2.2).

### 삭제는 이제 한 문장이다

```ts
await posts.remove(post.id);
res.status(204).end();
```

딸린 댓글은 애플리케이션이 아니라 **DB 가 걷어 간다** — `comments.postId` 의 `ON DELETE CASCADE` 다(4.3). 3단계에는 `comments.removeByPostId(post.id)` 가 앞줄에 있었고, 두 `Map` 을 차례로 비우는 사이에 "글은 없는데 댓글은 남은" 중간 상태가 있었다. 지금은 그 줄도 그 상태도 없다. `res.json({})` 은 `204` 규약 위반이라 `.end()` 다.

## 왜 이렇게 했는가

**`GET /posts` 가 `sort`·`q`·`authorId` 를 받는다.** 5·6단계에는 `PageQuery` 가 `.loose()` 라 이 셋이
조용히 무시됐고 `openapi.yaml` 에 "지금은 무시된다" 를 적어 두었다. 7.4·7.5 에서 스키마가 셋을 받고
모르는 파라미터는 `400` 이 됐다 — 라우터는 받은 값을 저장소로 넘기기만 한다.

**작성 응답으로 상세 형태를 돌려준다.** 프론트가 작성 직후 상세 화면으로 이동할 때 한 번 더 호출하지 않게 하려는 것이다. 목록 항목 형태를 주는 선택도 있었다.

**검증 상수가 스키마 파일로 갔다.** 3단계에 이 파일 맨 위에 있던 `MAX_LIMIT`·`TITLE_MAX` 는
`schemas/index.ts` 에 있고 여기 남은 것은 `DEFAULT_LIMIT` 하나다. 상한은 검증하는 곳에 있어야 한다.

## 3단계에서 무엇이 바뀌었나

커리큘럼 4.5 는 "저장소만 교체한다. 라우터와 상태 코드는 한 줄도 건드리지 않는다" 고 적었다. **지켜지지
않았다.** 파일 해시를 비교하면 라우터 3개와 `views.ts` 가 바뀌었고 그대로인 것은 `respond.ts` 하나다. 이 파일에서 바뀐 것은 셋이다.

- 핸들러 5개가 전부 `async` 가 됐다.
- 저장소·뷰 호출 앞에 `await` 가 붙었고, 목록 조립이 `await Promise.all(…)` 가 됐다.
- 삭제에서 `comments.removeByPostId(post.id)` 한 줄이 사라졌다. CASCADE 가 대신한다.

**상태 코드와 분기는 그대로다.** 4단계를 마친 시점의 `fail()` 분포는 `400` 9회, `401` 1회, `403` 3회,
`404` 6회, `409` 1회, `422` 4회이고 2.2 표와 일치한다. 회귀 검사 36가지는 **36 통과 · 0 실패**였다.

원인은 하나다. **3단계 저장소를 동기 함수로 만들었기 때문이다.** **교훈:** 저장소가 언젠가 원격이 될 것을
안다면 경계를 처음부터 비동기로 둔다. `Map` 을 쓰더라도 `async findById()` 로 감쌌으면 안 바뀌었다.

## 5단계에서 무엇이 바뀌었나

이번에는 라우터가 **줄어드는** 방향으로 바뀌었다.

- `limit`·`title`·`body` 검증 `if` 가 전부 사라졌다. `ListPostsQuery`·`CreatePostBody`·`UpdatePostBody`·`IdParams` 가 대신하고, 라우터 3개를 합쳐 검증 `if` 가 **0개**다.
- `req.body`·`req.query`·`req.params` 를 직접 읽지 않는다. `validBody<CreatePostBody>(req)` 처럼 검증을 통과한 값만 꺼내고, 타입은 스키마에서 `z.infer` 로 나온 것이라 따로 선언하지 않는다.
- `fail()` 호출이 **0개**가 됐다. `throw postNotFound()` · `throw new ForbiddenError(...)` 로 던지고, 4xx·5xx 바디를 만드는 곳은 `server/src/middleware/errorHandler.ts` 하나다.

이 파일에 남은 `throw` 는 5개다. 라우터의 `res.status` 는 성공 응답뿐이고 3개를 합쳐 `201` 3곳·`204` 2곳, 다섯 자리다. 잘못된 입력 12종과 누출 검사 4종, **16종 전부 통과**했다 — 모든 에러 응답이 `{error:{code,message,details}}` 한 형태였고 스택 트레이스·SQL·테이블명이 섞이지 않았다.

## 7단계에서 무엇이 바뀌었나

> 아래 수치는 2026-09-23 에 **PostgreSQL 18.6** 에서 다시 잰 것이다.
> 처음 잰 16.15 값과 결론은 같고 숫자만 조금 움직였다([09-list-performance.md](../09-list-performance.md)).

목록 핸들러가 필터 셋을 저장소로 넘기고 `Promise.all` 이 사라졌다. 이 파일에서 바뀐 것은 그 두 줄이 전부다. 글 1만 건 · 댓글 5만 건에서 인덱스 전후의 HTTP 응답 시간을 쟀다(중앙값, 각 15회).

| 요청 | 인덱스 전 | 후 |
|---|---|---|
| `GET /posts?limit=20` | 17.5 ms | 15.3 ms |
| `GET /posts?limit=50` | 17.0 ms | 16.1 ms |
| `?sort=createdAt:asc` | 17.7 ms | 16.8 ms |
| `?q=…` (제목 검색) | 20.0 ms | 17.9 ms |
| `?authorId=…` | 14.8 ms | 12.5 ms |

같은 질의의 DB 시간은 `1.922 ms → 0.049 ms` 로 39배 줄었는데(`store-posts.md`) HTTP 는 2 ms 움직였다.
**이 규모에서 병목은 DB 가 아니었다.** 남은 시간은 HTTP 왕복·JSON 직렬화·미들웨어 쪽에 있고, 인덱스가 갚는 것은 글이 더 늘었을 때의 기울기다. 회귀 검사는 3~6단계 것을 돌려 **40 통과 · 0 실패**다.

## 직접 해 볼 것

1. `?limit=0`, `?limit=999`, `?limit=abc`, `?limit=` 를 각각 보낸다. 넷 다 `400` 인가.
2. `?sort=title:asc` 와 `?sortt=x` 를 보낸다. 둘 다 `400` 이다 — 앞은 `z.enum`, 뒤는 `.strict()` 몫이다.
3. `PATCH /posts/:id` 를 남의 토큰으로 보내 `403` 을, 없는 uuid 로 `404` 를 받는다. uuid 가 아니면 `IdParams` 가 먼저 걸러 `400` 이다.
4. 댓글 2개를 단 글을 지우고 남은 댓글을 센다. `0` 이다 — 지우는 코드가 없는데 사라졌다.
5. `posts.findById(id)` 앞의 `await` 를 지운다. `Promise` 는 언제나 참이라 없는 글에 `404` 대신 `403` 이 나간다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 4.5 | **끝났다.** `posts.*` 가 Prisma 쿼리가 됐고, 약속과 달리 이 파일도 `async`/`await` 만큼 바뀌었다 |
| 4.7 | **필요 없어졌다.** 삭제가 한 문장이라 묶을 것이 없다. `$transaction` 은 한 요청에서 여러 테이블을 **쓰는** 자리가 생길 때 다시 본다 |
| 5.2 | **끝났다.** `limit`·`title` 검증 `if` 가 zod 스키마 + `validate` 미들웨어로 갔다 |
| 6.4 | `requireAuth` 의 안쪽이 JWT 검증으로 바뀐다. 이 파일은 그대로다 |
| 6.6 | 소유권 검사를 미들웨어로 뺄지 여기 남길지 정한다. 5곳을 같은 방식으로 맞춘다 |
| 7.4 | **끝났다.** `.loose()` 가 허용 목록으로 좁혀졌고 목록 밖의 값이 `400` 이 된다 |
| 7.7 | **끝났다.** 목록의 `Promise.all(...map(postListItemView))` 이 `map` 하나가 됐다 |
