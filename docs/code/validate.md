# server/src/middleware/validate.ts

> 커리큘럼 5.1 · 5.2 · 5.3 · 짝: `server/src/middleware/validate.ts`

## 무엇을 하는 파일인가

요청의 `body` · `query` · `params` 를 zod 스키마에 통과시키는 미들웨어 하나와, 통과한 값을 타입과
함께 꺼내는 헬퍼 셋이 들어 있다. 검증에 실패하면 응답을 만들지 않고 던진다 — 바디를 만드는 곳은
`errorHandler` 하나다(5.6). 효과는 라우터에서 센다. 5단계를 마친 시점에 라우터 3개의 **검증 `if` 문이 0개**, `fail()` 호출이
**0개**이고, `res.status` 는 성공 응답 5곳(201 ×3, 204 ×2)에만 남았다.

## 코드를 따라 읽기

### 라우터에 붙는 모습

```ts
postsRouter.patch("/:id", requireAuth, validate({ params: IdParams, body: UpdatePostBody }), …)
```

`validate(...)` 는 미들웨어를 **만들어 돌려준다.** 스키마를 클로저에 담아 두는 것이라 엔드포인트마다
다른 스키마를 같은 함수로 끼운다. 세 자리 중 필요한 것만 적는다.

### 셋을 한 번에 돌리고 한 번에 보고한다

```ts
for (const key of ["body", "query", "params"] as const) {
  const schema = schemas[key];
  if (!schema) continue;
  const result = schema.safeParse(req[key]);
  if (result.success) valid[key] = result.data;
  else (key === "body" ? bodyIssues : locationIssues).push(...result.error.issues);
}
```

`safeParse` 는 던지지 않고 `{ success, data | error }` 를 돌려준다. 첫 실패에서 멈추지 않고 셋을
다 돌리는 이유는 `details` 에 문제를 한꺼번에 담기 위해서다. 실패를 `bodyIssues` 와
`locationIssues` 두 자루로 나눠 담는 것이 아래 400/422 판정의 재료다.

### 통과한 값을 `req.valid` 에 담는 이유

```ts
declare global {
  namespace Express {
    interface Request { valid?: { body?: unknown; query?: unknown; params?: unknown } }
  }
}
```

흔한 방식은 파싱 결과를 `req.query = result.data` 처럼 되돌려 넣는 것이다. **Express 5 에서는 안
된다 — `req.query` 가 읽기 전용 getter 라서 대입이 통하지 않는다.** 그래서 원본은 그대로 두고
검증된 값을 따로 들고 다닌다.

막혀서 택한 길이지만 결과가 더 낫다. `req.body` 는 아무거나 들어올 수 있고 `req.valid` 는 스키마를
통과한 것만 들어 있다 — **"검증을 거쳤다"가 변수 이름에 드러난다.** `declare global` 의 선언
병합은 `middleware/currentUser.ts` 가 `req.user` 를 넓힐 때 쓴 것과 같다. 남의 라이브러리 타입에
우리 필드를 더하는 표준적인 방법이고 런타임 동작은 없다.

### 헬퍼 셋

```ts
export const validBody = <T>(req: Request): T => req.valid!.body as T;
```

`validBody<CreatePostBody>(req)` 로 부르면 핸들러가 타입이 붙은 값을 받는다. `!` 와 `as` 가 둘 다
들어간 단언이고, 근거는 **같은 라우트에 `validate({ body: … })` 가 끼워져 있다**는 사실이다.
스키마를 빼먹고 헬퍼만 부르면 런타임에서 터진다 — 그 대가로 핸들러가 짧아진다.

### 400 과 422 를 가르는 규칙 둘

```ts
const is400 = locationIssues.length > 0 || bodyIssues.some((i) => FORMAT_ISSUES.has(i.code));
```

`docs/02-api.md` 2.3 의 표를 한 줄로 옮긴 것이다.

1. **쿼리·경로 파라미터의 문제는 언제나 `400`.** 주소에 실려 온 값이라 형식의 문제로 본다.
   `?limit=999` 도 `400` 이다. `locationIssues` 가 하나라도 있으면 그 자리에서 `400` 이다.
2. **본문만 형식과 값을 가른다.** `FORMAT_ISSUES` 집합(`invalid_type` · `invalid_value` ·
   `invalid_format` · `unrecognized_keys`)에 들면 `400`, 그 밖(`too_small` · `too_big` ·
   `custom`)은 `422` 다. 사람이 판단하지 않고 zod 이슈 코드로 기계적으로 가른다.

**섞이면 `400` 이 이긴다.** `some` 이 `every` 가 아닌 것이 그 뜻이다. 제목이 숫자이고 본문이 201자인
요청에 "값이 규칙 위반" 이라고 답할 이유가 없다 — 형식부터 틀렸다. `details` 의 `path` 는 빈
배열일 때 `"(root)"` 가 된다 — `.strict()` 위반이나 `.refine()` 실패가 그렇다.

## 왜 이렇게 했는가

1. **미들웨어로 뺀 것.** 핸들러 첫 줄에서 `CreatePostBody.parse(req.body)` 를 부르면 동작은 같지만
   라우터 정의만 읽어서는 그 엔드포인트가 무엇을 받는지 알 수 없다. 미들웨어 자리에 스키마
   이름이 있으면 라우트 한 줄이 곧 계약서다.
2. **400/422 판정을 여기 한 곳에만 둔 것.** 스키마마다 `.refine()` 으로 상태 코드를 정하면
   판정 규칙이 스키마 파일 전체에 흩어져 2.3 의 표와 대조할 자리가 사라진다. 규칙을 바꿀 때
   고칠 곳은 `FORMAT_ISSUES` 한 줄이다.

## 직접 해 볼 것

1. `POST /posts` 에 `{ "title": 123, "body": "" }` 를 보낸다 → `400` 이고 `details` 에
   `invalid_type` 과 `too_small` 이 함께 담긴다. `body` 만 빈 문자열로 보내면 `422` 다.
2. `?limit=999` 와 본문 길이 상한을 넘긴 `POST /posts` 를 보낸다 → 둘 다 "범위를 벗어난 값" 인데
   앞은 `400`, 뒤는 `422` 다. 규칙 1과 2의 차이다.
3. `validate` 안에서 `req.query = result.data` 로 되돌려 넣어 본다 → Express 5 의 읽기 전용
   getter 때문에 대입이 통하지 않는 것을 확인한다. `req.valid` 가 있는 이유다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.6 | 소유권 검사를 미들웨어로 뺄 때, `req.valid.params` 를 읽는 미들웨어가 `validate` 뒤에 붙어야 한다는 순서 제약이 생긴다 |
| 7.4 | `sort` 허용 목록이 `ListPostsQuery` 에 들어간다. 목록 밖의 값은 `invalid_value` 라서 이 파일을 고치지 않아도 `400` 이 된다 |
| 8.2 | API 클라이언트가 `details` 의 `path` 를 폼 필드 이름으로 그대로 쓴다. 이름이 zod 경로와 같아야 한다 |
