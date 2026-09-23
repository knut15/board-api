# server/src/errors.ts

> 커리큘럼 5.4 · 5.5 · 짝: `server/src/errors.ts`

## 무엇을 하는 파일인가

도메인 에러를 **값**으로 만든다. `docs/02-api.md` 2.4 의 에러 코드 9개와 2.3 의 상태 코드를
클래스 하나씩에 묶어 둔 파일이고, 그 밖에는 아무 일도 하지 않는다 — `res` 를 모르고
Express 를 import 하지 않는다.

5단계 전에는 라우터가 `fail(res, 404, "POST_NOT_FOUND", "글을 찾을 수 없습니다.")` 로 응답을
직접 만들었다. 같은 뜻의 에러가 여섯 곳에서 각자 만들어지므로, 메시지 한 글자나 상태 코드
하나가 어긋나도 아무것도 막지 못한다. 이 파일은 그 세 값(status · code · message)을 한 번만
정해 두고 이름으로 부르게 한다.

## 코드를 따라 읽기

### 던지는 쪽은 상태 코드를 모른다

```ts
if (!post) throw postNotFound();
```

라우터가 아는 것은 "글이 없다" 뿐이다. 그것이 `404` 라는 사실, 코드가 `POST_NOT_FOUND` 라는
사실, 메시지가 무엇인지는 이 파일이 안다. 라우터에서 숫자 `404` 를 지우는 것이 요점이다 —
숫자가 흩어져 있으면 `docs/02-api.md` 2.2 표와 코드를 대조할 방법이 눈으로 세는 것밖에 없다.

### 뿌리는 하나다

```ts
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] | null = null,
  ) { … }
}
```

에러 핸들러가 볼 분기가 `err instanceof AppError` 하나가 되도록 뿌리를 하나로 뒀다.
자식 클래스를 각각 검사하면 클래스를 하나 늘릴 때마다 `errorHandler` 를 고쳐야 한다.
`status` · `code` · `details` 가 `readonly` 인 것은 던진 뒤에 누가 고치면 안 되기 때문이고,
`this.name = new.target.name` 은 서버 로그에 실제 클래스 이름이 찍히게 한다.

### 코드 목록을 배열로 두고 타입을 뽑는다

```ts
export const ERROR_CODES = [ "VALIDATION_FAILED", …, "INTERNAL_ERROR" ] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
```

유니언 타입을 손으로 쓰면 런타임에는 그 목록이 없다. 배열로 두면 타입과 값이 한 줄에서
나오고, 나중에 "우리가 내는 코드 전부"를 훑을 자리(문서 생성, 테스트)가 생긴다.
`as const` 를 빼면 타입이 `string[]` 이 되어 `ErrorCode` 가 그냥 `string` 이 된다.

### 상태 코드별로 클래스를 하나씩

`BadRequestError`(400) · `UnprocessableError`(422) · `UnauthenticatedError`(401) ·
`ForbiddenError`(403) · `NotFoundError`(404) · `ConflictError`(409). 이름에 상태 코드가 보이는
것이 전부다. `UnauthenticatedError` 만 "로그인 화면으로 보내도 되는 유일한 에러" 라고 주석을
달아 뒀다 — `403` 은 다시 로그인해도 풀리지 않으므로 프론트가 다르게 다뤄야 한다.

### `NotFoundError` 의 code 는 이름 모양으로 좁혀져 있다

```ts
constructor(code: Extract<ErrorCode, `${string}NOT_FOUND`>, message: string)
```

`ErrorCode` 9개 중 `POST_NOT_FOUND` · `COMMENT_NOT_FOUND` · `ROUTE_NOT_FOUND` 셋만 남는다.
`new NotFoundError("FORBIDDEN", …)` 는 타입 에러가 된다. 목록을 손으로 다시 적지 않고
**이름 규칙으로** 좁힌 것이라, 나중에 `USER_NOT_FOUND` 가 늘어도 이 줄은 그대로다.

### 자주 쓰는 것은 factory 로

```ts
export const postNotFound = () => new NotFoundError("POST_NOT_FOUND", "글을 찾을 수 없습니다.");
```

`postNotFound()` 는 `routes/posts.ts` 에서 4번, `routes/comments.ts` 에서도 불린다. 클래스를
직접 부르면 그 자리마다 메시지 문자열을 다시 적게 되고, 언젠가 한 곳만 "게시글을 찾을 수
없습니다." 가 된다. 메시지가 흔들리지 않는 것이 factory 의 값 전부다.

## 왜 이렇게 했는가

1. **에러 코드를 enum 이 아니라 `as const` 배열로 둔 것.** TypeScript `enum` 은 런타임에
   객체를 만들고 역매핑까지 붙인다. 우리에게 필요한 것은 문자열 9개와 그 유니언뿐이다.
2. **클래스를 상태 코드 기준으로 나눈 것.** 도메인 기준(`PostError`, `UserError`)으로 나누는
   방법도 있다. 그러면 `PostError` 가 404 인지 403 인지 이름만으로 알 수 없어, 결국 생성할 때
   상태 코드를 손으로 넘기게 된다. 이 프로젝트의 에러는 전부 HTTP 로 나가므로 HTTP 를 기준으로 잡았다.
3. **`INTERNAL_ERROR` 전용 클래스를 안 만든 것.** 500 은 우리가 던지는 것이 아니라 아무도
   안 잡았을 때 남는 것이다. 던질 수 있게 만들어 두면 "일단 500" 이 생긴다.

## 직접 해 볼 것

1. `new NotFoundError("FORBIDDEN", "…")` 를 아무 라우터에 쓰고 `pnpm typecheck` 를 돌린다 →
   `NotFoundError` 의 좁혀진 `code` 타입 때문에 컴파일 단계에서 막히는 것을 본다.
2. `ERROR_CODES` 의 `as const` 를 지우고 typecheck 한다 → `ErrorCode` 가 `string` 으로 넓어져
   오타 난 코드가 전부 통과하게 되는 것을 확인한다. 5.4 가 막으려던 것이 이것이다.
3. `postNotFound()` 의 메시지를 바꾸고 없는 글을 `GET`·`PATCH`·`DELETE` 로 각각 부른다 →
   한 곳을 고쳐 세 응답이 같이 바뀐다. 3단계였다면 세 곳을 고쳐야 했다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.2 | 로그인 실패는 `INVALID_CREDENTIALS` 하나로 답한다. 지금 `routes/auth.ts` 가 `AppError` 를 직접 던지는 자리가 전용 클래스로 정리될 수 있다 |
| 6.4 | JWT 만료·서명 불일치가 전부 `UnauthenticatedError` 로 모인다. 만료와 위조를 구분하지 않는다 |
| 6.6 | 소유권 검사가 미들웨어로 빠지면 `ForbiddenError` 를 던지는 자리가 5곳에서 1곳이 된다 |
| 7.4 | `sort` 허용 목록 밖의 값은 스키마에서 걸러 `BadRequestError` 가 된다. 이 파일은 그대로다 |
