# server/src/schemas/index.ts

> 커리큘럼 5.1 · 5.3 · 7.4 · 7.5 · 짝: `server/src/schemas/index.ts`

## 무엇을 하는 파일인가

요청 스키마를 엔드포인트 단위로 모아 둔 파일이다. zod 4 로 쓴 스키마 10여 개와 거기서 `z.infer` 로
뽑은 타입이 전부다. 검증을 **실행하는** 것은 `middleware/validate.ts` 이고 이 파일은 규칙만 적는다 —
Express 를 import 하지 않는다. 라우터에 흩어져 있던 `TITLE_MAX` 같은 상수도 여기로 모였다.

## 코드를 따라 읽기

### 이름을 엔드포인트에 맞춘다 (5.1)

```ts
export const CreatePostBody = …
export const ListPostsQuery = PageQuery.extend({
  sort: SortQuery,
  q: z.string().trim().min(1).max(100).optional(),
  authorId: uuid.optional(),
}).strict();
```

`PostSchema` 가 아니라 `CreatePostBody` 다. 도메인 이름으로 지으면 "글" 스키마 하나를 작성과 수정이
함께 쓰게 되는데 둘은 규칙이 다르다 — 작성은 `title` 이 필수이고 수정은 아니다. **이름에 쓰이는 자리가
들어 있어야** 라우터에서 스키마 이름만 보고 계약을 읽는다.

### 정렬은 허용 목록으로만 받는다 (7.4)

```ts
export const SORT_KEYS = ["createdAt:desc", "createdAt:asc"] as const;
export const SortQuery = z.enum(SORT_KEYS).optional();
export type SortKey = (typeof SORT_KEYS)[number];
```

**사용자 입력을 그대로 `orderBy` 에 넣지 않는다.** 넣으면 없는 컬럼 이름으로 DB 가 죽거나, 인덱스가
없는 컬럼으로 정렬해 목록이 통째로 느려진다. `z.enum` 은 검증과 허용 목록을 한 자리에서 끝낸다 — 밖이면
`400` 이다. `SortKey` 를 같이 내보내 `findMany` 인자도 이 두 값만 받고, 늘릴 곳은 이 배열 하나다.

### 타입은 뽑는다, 선언하지 않는다 (5.3)

```ts
export type CreatePostBody = z.infer<typeof CreatePostBody>;
```

같은 이름을 값과 타입으로 둘 다 쓴다. TypeScript 는 값 공간과 타입 공간이 따로라 충돌하지
않고, 부르는 쪽은 `validBody<CreatePostBody>(req)` 처럼 하나만 import 하면 된다.

`interface` 로 따로 쓰는 방법도 있다. 처음에는 같지만 **언젠가 갈라진다** — 스키마에 필드를 더하고
타입을 안 고치면 아무도 안 막는다. `z.infer` 는 스키마가 진실이라고 못 박는 것이다.

### `z.coerce` 대신 문자열을 먼저 검사한다

```ts
const intFromQuery = (min: number, max: number) =>
  z.string().regex(/^\d+$/, "정수여야 합니다.")
   .transform(Number)
   .refine((n) => n >= min && n <= max, `${min} 이상 ${max} 이하여야 합니다.`);
```

쿼리 파라미터는 언제나 문자열로 온다. `z.coerce.number()` 한 줄이면 될 것 같지만 `coerce` 는
`Number()` 를 그냥 부른다 — **`Number("")` 은 `0`** 이다. 하한이 없으면 `?limit=` 가 `0` 으로 조용히
통과하고, 있어도 "빈 값" 이 "0 을 보냈다" 로 보고된다. `Number(" 12 ")`·`Number("1e3")` 도 같다.

그래서 순서를 뒤집었다. **문자열인 채로 모양을 먼저 보고**(`regex`), 통과한 것만 숫자로
바꾸고(`transform`), 그다음 범위를 본다(`refine`). `?limit=`·`?limit=abc`·`?limit=1e3` 은 첫 관문에서,
`?limit=999` 는 마지막에서 끝난다. 3단계 라우터의 `Number.isInteger` 검사가 하던 일과 같다.

### `.strict()` 로 모르는 필드를 막는다

zod 의 기본값은 모르는 키를 **조용히 버리는 것**이다. `{ "titel": "오타" }` 를 보내면 `titel` 이
사라지고 `title` 누락으로 보고된다. `.strict()` 를 붙이면 `unrecognized_keys` 이슈가 나고 2.3 의
표대로 `400` 이 된다 — 프론트가 필드 이름을 틀렸다는 것을 응답에서 읽는다.

5·6단계에는 `PageQuery` 하나만 `.loose()` 로 반대였다. 2.2 에 이름만 정해 둔 `sort`·`q`·`authorId` 가
붙을 자리를 비워 둔 것이다. 셋이 실제로 생긴 지금은 `PageQuery` 도 `.strict()` 이고, 이 파일의 모든
스키마가 같은 규칙을 쓴다.

### `LoginBody` 에서만 email 형식을 검사하지 않는다

`SignupBody` 의 `email` 은 `z.email()` 인데 `LoginBody` 는 `z.string()` 이다. 형식 오류로 `400` 을
돌려주면 **그 응답 자체가 "이 값은 이메일이 아니다" 라는 정보**가 된다. 로그인 실패는 이메일이 없든
비밀번호가 틀리든 `401` `INVALID_CREDENTIALS` 하나로 답하기로 한 6.2 규칙과 어긋난다.

### `UpdatePostBody` 의 `.refine()`

`PATCH` 는 부분 수정이라 `.partial()` 로 전부 선택이 되고, 그러면 `{}` 도 통과하므로 하나는 있어야
한다는 조건을 덧붙인다. `refine` 실패는 이슈 코드가 `custom` 이라 `422` 다 — 형식은 맞는데 값이 규칙
위반이다. 작성과 수정이 한 정의에서 나오므로 길이 상한이 갈라지지 않는다.

## 왜 이렇게 했는가

1. **파일 하나에 모은 것.** 엔드포인트별로 쪼개는 방법도 있다. 스키마가 20개를 넘기 전에는
   `PageQuery` 같은 공통 조각을 한 파일에서 재사용하는 쪽이 읽기 쉽다.
2. **`TITLE_MAX` 를 상수로 내보낸 것.** 숫자를 스키마 안에 박아도 되지만, `server/openapi.yaml`
   의 `maxLength` 와 같은 값이어야 한다. 이름이 있어야 대조할 수 있다.
3. **에러 메시지를 스키마에 적은 것.** 미들웨어에서 이슈 코드로 문장을 만들면 "닉네임을 입력해 주세요"
   같은 필드별 문장이 안 나온다. 프론트는 `code` 와 `details` 로 분기하므로(2.4) 여기는 한글로 적는다.

## 7단계에서 무엇이 바뀌었나

`PageQuery` 가 `.loose()` 에서 `.strict()` 로 바뀌고, `SORT_KEYS` enum 과 `ListPostsQuery` 의
`sort`·`q`·`authorId` 가 생겼다. `GET /posts` 에 값을 넣어 본 결과다.

| 보낸 쿼리 | 응답 |
|---|---|
| `?sort=createdAt:desc` · `?sort=createdAt:asc` | `200` |
| `?sort=title:asc` (허용 목록 밖) | **`400`** |
| `?sort=createdAt:DESC` (대문자) | **`400`** |
| `?sort=id` (형식이 아예 다름) | **`400`** |
| `?sortt=x` (파라미터 이름 오타) | **`400`** |

`title:asc` 가 `400` 인 것이 요점이다. `title` 은 실재하는 컬럼이라 그냥 넣었으면 동작은 했을 것이다 —
인덱스 없이 1만 건을 정렬하면서. 허용 목록은 "없는 컬럼" 만 막는 것이 아니라 **감당할 수 있는 정렬만
받겠다는 선언**이다. 대문자 `DESC` 를 받아 주면 허용 목록이 두 벌이 되고, 두 벌은 언젠가 갈라진다.

`?sortt=x` 의 `400` 은 `.strict()` 몫이다. `.loose()` 였다면 이 요청은 `200` 에 기본 정렬로 답했고,
프론트는 "정렬이 안 먹네" 만 보고 원인을 서버 로그에서 찾았을 것이다.

## 직접 해 볼 것

1. `intFromQuery` 를 `z.coerce.number().int().min(1).max(50)` 로 바꾸고 `?limit=%2012%20`(`" 12 "`) 을
   보낸다 → `400` 이던 것이 통과한다. `?limit=` 도 보내 `details.rule` 을 비교하고 되돌린다.
2. `CreatePostBody` 의 `.strict()` 를 지우고 `{ "titel": "오타", "body": "x" }` 를 보낸다 →
   `unrecognized_keys` 대신 `title` 누락(`invalid_type`)으로 보고되는 것을 본다.
3. `PageQuery` 를 `.loose()` 로 되돌리고 `?sortt=x` 를 보낸다 → `400` 이 `200` 이 된다. 되돌린다.
4. `SORT_KEYS` 에 `"title:asc"` 를 넣고 `?sort=title:asc` 를 보낸다 → `200` 이다. 그 정렬의 실행 계획을 보고 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.1 | `SignupBody` 의 `password` 최소 길이가 해시 도입과 함께 다시 검토된다. 스키마만 고친다 |
| 7.4 · 7.5 | **끝났다.** `sort`·`q`·`authorId` 가 들어왔고 `.loose()` 가 `.strict()` 가 됐다. 허용 목록은 `z.enum` 이다 |
| 8.2 | 프론트가 같은 규칙을 다시 쓴다. 스키마를 공유할지 OpenAPI 에서 생성할지 그때 정한다 |
