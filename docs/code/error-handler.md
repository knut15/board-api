# server/src/middleware/errorHandler.ts

> 커리큘럼 5.6 · 5.7 · 짝: `server/src/middleware/errorHandler.ts`

## 무엇을 하는 파일인가

던져진 에러를 HTTP 응답으로 바꾼다. **4xx·5xx 바디를 만드는 유일한 곳**이고, 5단계를 마친 지금
`respond.ts` 의 `fail()` 을 부르는 파일은 이것 하나다. 라우터는 던지기만 한다 — `throw` 가
auth 3 · posts 6 · comments 4 곳이고 라우터의 `fail()` 호출은 0개다. `docs/02-api.md` 2.4 의
"모든 4xx·5xx 가 이 형태 하나" 를 문서가 아니라 구조로 지키는 것이다.

## 코드를 따라 읽기

### 인자 4개가 곧 등록이다

```ts
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
```

Express 는 **함수의 인자 개수(`fn.length`)로** 에러 핸들러를 알아본다. 3개면 평범한 미들웨어,
4개면 에러 핸들러다. 안 쓰는 `_next` 를 지우면 인자가 3개가 되어 에러가 여기로 오지 않고
Express 기본 처리가 HTML 스택 트레이스를 뱉는다. **린터가 지우라고 해도 두는 인자**다.
`app.ts` 맨 끝에 등록하는 것도 같은 이유이고, Express 5 는 `async` 핸들러가 던진 것도
자동으로 넘겨 주므로 라우터에 `try/catch` 가 없다.

### 응답이 이미 나갔으면 물러난다

`if (res.headersSent) { _next(err); return; }` — 핸들러가 응답을 보낸 뒤에 터진 경우다. 헤더는
한 번만 쓸 수 있어 여기서 `res.status(500).json(...)` 을 부르면 `ERR_HTTP_HEADERS_SENT` 가 나고
원래 에러가 거기 덮인다. 손댈 수 없는 상황을 알아보고 Express 기본 처리에 넘긴다.

### 우리가 던진 것

```ts
if (err instanceof AppError) { fail(res, err.status, err.code, err.message, err.details); return; }
```

분기가 하나다. `errors.ts` 가 모든 도메인 에러를 `AppError` 하나에서 내렸기 때문이고, 클래스를
늘려도 이 줄은 안 바뀐다. 세 값이 에러에 실려 오므로 이 파일은 그것이 무엇인지 알 필요가 없다.

### 깨진 JSON 을 400 으로 옮긴다

```ts
if (isBodyParseError(err)) { fail(res, 400, "VALIDATION_FAILED", "…올바른 JSON 이 아닙니다."); return; }
```

이 분기는 실측으로 생겼다. 본문이 `{"title":` 처럼 깨져 있으면 `express.json()` 이 라우터 앞에서
던지고, 그때까지 이 분기가 없어 **`500` 이 나갔다** — 2.3 이 "JSON 파싱 실패" 를 `400` 으로 정해
두었으므로 명세 위반이다. `err.message` 를 그대로 쓰지 않은 것이 두 번째 요점이다. body-parser 의
메시지에는 **깨진 본문 일부와 위치**가 들어 있다. 알아보는 방법도 `instanceof` 가 아니라
`err.type === "entity.parse.failed"` 라, 그쪽 클래스를 import 하지 않아도 된다.

### 5.7 — Prisma 에러를 우리 말로 옮긴다

```ts
case "P2002": return { status: 409, code: "EMAIL_ALREADY_EXISTS", … }; // 유니크 위반
case "P2025": return { status: 404, code: "POST_NOT_FOUND", … };       // 레코드 없음
case "P2003": return { status: 404, code: "POST_NOT_FOUND", … };       // 외래키 위반
default:      return null;                                             // → 500
```

Prisma 에러를 그대로 흘리면 테이블명 · 컬럼명 · 쿼리 원문이 응답에 실려 나간다. 세 개만
옮기고 나머지는 `null` 을 돌려 `500` 으로 떨어뜨린다 — **모르는 것을 짐작해 4xx 로 바꾸지
않는다.** `P2003`(외래키 위반)이 `404` 인 것은 댓글을 달려는 글이 그 사이에 지워진 경우가
이 코드로 오기 때문이다. 사용자에게는 "그 글이 없다" 가 맞다.

알아보는 기준이 `instanceof PrismaClientKnownRequestError` 가 아니라 **`code` 의 모양**인 것도 정한
것이다. Prisma 7 은 드라이버 어댑터를 거치며 에러 객체가 여러 경로로 만들어지고, 경로가 다르면
`instanceof` 가 어긋난다. `code` 는 어느 경로로 와도 `P` + 숫자 4자리다.

### 남은 전부는 500

```ts
console.error("[unhandled]", err);
fail(res, 500, "INTERNAL_ERROR", "서버에서 문제가 생겼습니다.");
```

**안쪽은 서버 로그에, 밖으로는 아무것도.** 두 줄이 정확히 그 뜻이다. `err.message` 를 응답에 넣고
싶어지는 자리이고, 그것이 스택 트레이스·`node_modules` 경로·SQL·테이블명이 새는 가장 흔한 길이다.

5단계 끝에 잘못된 입력 12종과 누출 검사 4종, **16종 전부**를 돌렸다. 모든 응답이
`{error:{code,message,details}}` 형태이고 최상위 키가 `error` 하나뿐이며, 스택 트레이스 ·
`node_modules` · SQL · 테이블명 · Prisma 내부 이름이 하나도 섞이지 않았다. 3·4단계 회귀 검사도
**40 통과 · 0 실패**다.

## 왜 이렇게 했는가

1. **분기 순서를 `AppError` → 파싱 에러 → Prisma → 그 밖으로 둔 것.** 좁은 것부터 넓은 것
   순이고, `AppError` 가 맨 앞인 이유는 뜻을 담아 던진 것이라 번역보다 언제나 정확해서다.
2. **Prisma 번역을 store 가 아니라 여기서 한 것.** `store/posts.ts` 에서 `try/catch` 로 잡으면
   저장소 함수마다 같은 `catch` 가 붙고 빠뜨린 곳에서 `500` 이 샌다. 대신 `P2025` 의 메시지가
   뭉툭해진다 — 또렷한 문장이 필요한 자리는 라우터가 먼저 검사해 `postNotFound()` 를 던진다.
3. **`500` 에 `details` 를 안 넣은 것.** 개발 환경에서만 스택을 넣으면 환경 변수 하나로 누출
   여부가 갈리고, 운영에서 그 값이 틀릴 날이 온다. 디버깅에 필요한 것은 로그에 남아 있다.

## 직접 해 볼 것

1. `_next` 인자를 지우고 없는 경로를 부른다 → `404` `ROUTE_NOT_FOUND` 대신 Express 기본 HTML
   에러 페이지가 나온다. 인자 개수가 곧 등록이라는 것을 눈으로 본다. 되돌린다.
2. `POST /posts` 에 `{"title":` 만 보낸다 → `400` 이다. `isBodyParseError` 분기를 지우고 같은
   요청을 보내면 `500` 이 된다. 고치기 전의 상태다.
3. `fail(res, 500, …)` 의 message 를 `String(err)` 로 바꾸고 에러를 던져 본다 → 파일 경로와 내부 이름이 응답에 실린다. 누출 검사 4종이 잡는 것이 이것이다. 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.4 | JWT 검증 실패(만료·서명 불일치)가 `UnauthenticatedError` 로 바뀌어 첫 분기로 들어온다. 이 파일은 그대로다 |
| 7.7 | `P2002` 를 만날 자리가 가입 말고도 생긴다. `EMAIL_ALREADY_EXISTS` 고정이 맞는지 다시 본다 |
| 9.3 | `console.error` 가 구조화 로깅으로 바뀐다. 요청 id 를 남겨 응답의 `code` 와 로그를 맞춘다 |
