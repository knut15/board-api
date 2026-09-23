# server/src/routes/comments.ts

> 커리큘럼 3.5 · 3.6 · 4.5 · 5.2 · 짝: `server/src/routes/comments.ts`

## 무엇을 하는 파일인가

댓글 목록 · 작성 · 삭제. `docs/02-api.md` 2.2 표의 9·10·11번이다. 한 파일에서 라우터를 **둘** 내보낸다 —
목록과 작성은 글에 딸려 있고(`/posts/:postId/comments`), 삭제는 댓글 자체를 가리킨다(`/comments/:id`).

## 코드를 따라 읽기

### mergeParams 가 없으면 postId 를 못 읽는다

```ts
export const postCommentsRouter = Router({ mergeParams: true });
```

이 라우터는 `app.use("/posts/:postId/comments", postCommentsRouter)` 로 붙는다. `:postId` 는
**마운트 경로**에 있고 라우터 안의 경로(`"/"`)에는 없다. Express 는 기본적으로 부모의 파라미터를
자식 라우터에 내려보내지 않아서, `mergeParams: true` 가 없으면 `req.params.postId` 가 `undefined` 다.
3단계에는 타입을 손으로 좁히는 단언이 핸들러마다 있었는데 지금은 없다.

```ts
const { postId } = validParams<PostIdParams>(req);
```

`PostIdParams`(= `z.object({ postId: uuid })`)가 uuid 검사와 타입을 한 번에 준다. 단언은 `validParams`
안 한 곳에 모였고, 핸들러는 "검증을 통과한 값" 만 본다. `mergeParams` 가 여전히 필요한 것은 그대로다 — 그것이 없으면 스키마에 들어올 값 자체가 없다.

### 부모 리소스의 존재를 먼저 확인한다

```ts
if (!(await posts.findById(postId))) throw postNotFound();
```

없는 글의 댓글 목록은 **빈 배열이 아니라 `404`** 다. 빈 배열로 답하면 프론트가 "댓글이 없는 글" 과
"없는 글" 을 구분할 수 없다. `docs/02-api.md` 표 9행이 그래서 `404` 를 갖는다. 던지는 것은
`commentNotFound()` 가 아니라 `postNotFound()` 다 — 없는 것은 글이다. 둘 다 `server/src/errors.ts` 의 공장 함수이고, `code` 와 메시지가 거기 한 번만 적혀 있다.

괄호가 한 겹 늘었다. `!await f()` 로 써도 결과는 같지만(`await` 가 `!` 보다 먼저 묶인다) 눈에 띄라고
남겼다. 진짜로 위험한 것은 `await` 를 아예 빼는 쪽이다 — `Promise` 는 언제나 참이라 `!` 가 false 가 되고 존재 검사가 통째로 무력해진다.

### 댓글 삭제의 권한은 좁다

```ts
if (comment.authorId !== req.user!.id) {
  throw new ForbiddenError("내 댓글만 삭제할 수 있습니다.");
}
```

댓글 작성자만 지운다. 글 작성자가 자기 글의 남의 댓글을 지우는 권한은 없다 — `docs/01-domain.md`
의 "안 만들 것" 4번에서 권한 등급을 "소유자냐 아니냐" 둘로 정했기 때문이다. 실제 게시판에서는 글쓴이에게 삭제권을 주는 경우가 많고, 그것을 넣는 순간 역할이라는 개념이 필요해진다.

### Location 을 붙이지 않는다

```ts
res.status(201).json(await commentView(comment));
```

`201` 에는 `Location` 을 넣는 것이 규약이지만(`docs/02-api.md` 2.3) 가리킬 주소가 있어야 성립한다.
`DELETE /comments/:id` 는 있고 `GET /comments/:id` 는 없다. 가져올 수 없는 주소를 적으면 프론트가 그것을 호출하고 `404` 를 받는다. 그래서 2.3 을 "GET 가능한 단건 경로가 있을 때만" 으로 좁혔다.

## 왜 이렇게 했는가

**라우터를 한 파일에 둘 뒀다.** 경로 모양이 달라도 다루는 리소스가 같아서다. 나누면 댓글 규칙(본문 길이 상한, 소유권 판정)이 두 파일에 흩어진다. 3.5 의 기준은 "200줄을 넘기 전에 나눈다" 다.

**등록 순서가 동작을 만든다.** `app.ts` 가 `/posts/:postId/comments` 를 `/posts` 보다 먼저 등록한다.
`/posts/x/comments` 요청은 `/posts` 라우터에도 들어가지만 맞는 라우트가 없어 `next()` 로 빠져나온다. 순서를 뒤집어도 지금은 동작하지만, `/posts` 에 `/:id/*` 를 추가하는 날 먼저 걸려 버린다.

## 3단계에서 무엇이 바뀌었나

커리큘럼 4.5 는 "저장소만 교체한다. 라우터와 상태 코드는 한 줄도 건드리지 않는다" 고 적었다.
**지켜지지 않았다.** 3단계 끝과 파일 해시를 비교하면 라우터 3개와 `views.ts` 가 바뀌었고
그대로인 것은 `respond.ts` 하나다. 이 파일에서 바뀐 것은 셋이다.

- 핸들러 3개가 전부 `async` 가 됐다.
- 존재 검사가 `!(await posts.findById(postId))` 로, `commentView(...)` 가 `await commentView(...)` 로 바뀌었다.
- 목록 항목 조립이 `await Promise.all(page.items.map(commentView))` 가 됐다.

**상태 코드와 분기는 그대로다.** 4단계를 마친 시점의 `fail()` 분포는 `400` 9회, `401` 1회,
`403` 3회, `404` 6회, `409` 1회, `422` 4회이고 `docs/02-api.md` 2.2 표와 일치한다.
3단계에 써 둔 회귀 검사 36가지를 DB 위에서 다시 돌려 **36 통과 · 0 실패**였다.

원인은 하나다. **3단계 저장소를 동기 함수로 만들었기 때문이다.** DB 는 원격이라 조회가 기다림이 되고,
`posts.findById(id)` 가 `await posts.findById(id)` 가 되면 그것을 부르는 핸들러가 전부 `async` 가 된다.

**교훈:** 저장소가 언젠가 원격이 될 것을 안다면 경계를 처음부터 비동기로 둔다. `Map` 을 쓰더라도
`async findById()` 로 감쌌으면 이 파일이 한 줄도 안 바뀌었다. 반환 타입까지 같아야 경계가 버틴다.

## 5단계에서 무엇이 바뀌었나

이 파일에서 바뀐 것은 셋이다.

- `body` 검증과 `postId` 단언이 `CreateCommentBody`·`PostIdParams`·`IdParams`·`ListCommentsQuery` 로 갔다(`server/src/schemas/index.ts`). 라우터 3개를 합쳐 검증 `if` 가 **0개**다.
- 핸들러가 `req.body`·`req.params` 를 직접 읽지 않는다. `validBody<CreateCommentBody>(req)` · `validParams<PostIdParams>(req)` 로 검증을 통과한 값만 꺼낸다.
- `fail()` 호출이 **0개**가 됐다. `throw postNotFound()` · `throw commentNotFound()` · `throw new ForbiddenError(...)` 로 던지고, 4xx·5xx 바디를 만드는 곳은 `server/src/middleware/errorHandler.ts` 하나다.

이 파일에 남은 `throw` 는 4개다. 라우터의 `res.status` 는 성공 응답뿐이고 3개를 합쳐 `201` 3곳·`204`
2곳, 다섯 자리다. 던지기는 그 자리에서 함수를 벗어나므로 `return` 을 잊을 곳이 없다. 잘못된 입력
12종과 누출 검사 4종, **16종 전부 통과**했다 — 모든 에러 응답이 `{error:{code,message,details}}` 한 형태였고 스택 트레이스·SQL·테이블명이 섞이지 않았다. 회귀 검사는 **40 통과 · 0 실패**다.

## 직접 해 볼 것

1. `Router({ mergeParams: true })` 를 `Router()` 로 바꾸고 댓글 목록을 조회한다. `postId` 가 `undefined` 가 되고, 이제는 `PostIdParams` 가 먼저 걸러 `404` 가 아니라 `400` 이다.
2. 없는 글 id 로 댓글 목록과 댓글 작성을 각각 호출한다. 둘 다 `404` `POST_NOT_FOUND` 인지 확인한다. uuid 가 아닌 문자열을 넣으면 `400` 이다 — 형식이 틀린 것과 대상이 없는 것은 다른 답이다.
3. A 가 쓴 글에 B 가 댓글을 달고 A 가 그 댓글을 지우려 한다. `403` 이다. B 가 지우면 `204` 다.
4. 존재 검사에서 `await` 를 지우고 없는 글 id 로 댓글을 단다. 외래키 제약에 걸리고 `errorHandler` 의 `translatePrisma` 가 `P2003` 을 `404` 로 옮긴다. 겉보기 코드가 같아졌으니 사전 검사를 남길 이유가 아직 있는지 직접 판단해 본다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 4.3 | **끝났다.** 없는 글에 댓글을 달면 외래키 제약도 막는다. 사전 `findById` 검사와 역할이 겹치지만, `404` 형태를 맞추려고 사전 검사를 남겨 두었다 |
| 4.5 | **끝났다.** `comments.*` 가 Prisma 쿼리가 됐고, 약속과 달리 이 파일도 `async`/`await` 만큼 바뀌었다 |
| 5.2 | **끝났다.** `body` 검증이 `CreateCommentBody` 스키마로 갔다 |
| 5.7 | **끝났다.** `errorHandler` 의 `translatePrisma` 가 `P2003` 을 `404` 로 옮긴다. 사전 검사는 메시지를 또렷하게 두려고 남겼다 |
| 7.3 | 댓글 목록도 `(createdAt, id)` 복합 커서로 바뀐다 |
