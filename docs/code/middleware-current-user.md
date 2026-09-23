# server/src/middleware/currentUser.ts

> 커리큘럼 3.6 · 6.4 · 6.5 · 짝: `server/src/middleware/currentUser.ts`

## 무엇을 하는 파일인가

"이 요청을 보낸 사람이 누구인가" 를 정하는 파일이다. `Authorization: Bearer <JWT>` 에서 토큰을 꺼내
검증하고 `req.user` 에 넣는 `currentUser` 와, `req.user` 가 없으면 401 을 내는 `requireAuth` 두 함수가
있다. **라우터는 헤더 이름도 토큰 형식도 모른다** — 6.4 에서 고칠 파일이 이 하나로 끝난 이유다.

## 코드를 따라 읽기

`req.user` 는 Express 에 원래 없는 필드라 타입부터 넓힌다.

```ts
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}
```

이것이 **선언 병합**이다. TypeScript 는 같은 이름의 `interface` 선언을 하나로 합치므로, 이 블록은
Express 의 `Request` 에 `user` 를 **추가**한다 — 덮어쓰는 것이 아니다. 없으면 `req.user = ...` 에서
컴파일 에러가 난다. `user?` 가 옵셔널인 것은 사실을 반영한 것이다 — 비로그인 요청에는 실제로 없다.

```ts
export async function currentUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    req.user = { id: await verifyToken(header.slice("Bearer ".length), "access") };
  } catch {
  }
  next();
}
```

**헤더가 없어도 그냥 통과시킨다.** `currentUser` 는 `app.use()` 로 등록돼 모든 요청이 지나므로, 여기서
401 을 내면 `docs/02-api.md` 2.2 에서 인증 열이 "—" 인 엔드포인트가 전부 잠긴다. `GET /posts` 는
인증이 필요 없다 — 공개 목록은 공개여야 한다.

**`catch` 를 비워 둔 것도 같은 이유다.** 망가진 토큰을 들고 온 것은 "누군지 모름" 이지 "막아야 함" 이
아니다. 여기서 던지면 공개 엔드포인트가 망가진 토큰 하나에 잠긴다. 신원만 비워 두고, 로그인이
필요한 자리에서 `requireAuth` 가 401 을 낸다.

`verifyToken` 에 `"access"` 를 같이 넘기는 것은 **리프레시 토큰으로 API 를 부르는 것을 막기 위해서다.**
토큰 페이로드의 `typ` 가 `"access"` 가 아니면 검증이 실패한다(`server/src/auth/tokens.ts`).
함수가 `async` 인 것도 여기서 온다 — 서명 검증이 `Promise` 를 돌려주기 때문이다.

```ts
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new UnauthenticatedError();
  next();
}
```

**막는 일은 따로 뗐다.** `currentUser` 는 전역이고 판단하지 않는다. `requireAuth` 는 인증이 필요한
라우터에만 끼워 거기서만 막으므로 401 을 내는 자리가 이 한 곳뿐이다. 이 미들웨어를 지난 라우터가
`req.user!.id` 로 `!` 를 쓰는 것은 그 사실을 타입에 알려 주는 것이다. 5단계 전에는 여기서 응답을
직접 만들었지만 지금은 던지기만 한다 — 401 바디를 만드는 곳은 `errorHandler` 하나다.

401 과 403 의 구분은 `docs/02-api.md` 2.3 을 그대로 따른다 — `401` 은 "누군지 모름. 토큰이 없거나
만료됐거나 서명이 안 맞음", `403` 은 "누군지는 아는데 권한이 없음. 남의 글을 지우려 할 때". 이 파일은
401 만 담당하고, 403 은 "누군지는 안다" 가 전제라 소유권을 아는 라우터의 일이다.

## 왜 이렇게 했는가

- **분리 vs 한 함수.** 합치면 전역에 걸 수 없고 "식별" 과 "강제" 가 섞여 선택적 로그인을 다룰 수 없다.
- **헤더 이름을 라우터에 노출하지 않기.** 라우터가 헤더를 직접 읽었다면 6.4 에서 고칠 파일이 3개가
  됐다. 실제로 고친 파일은 이 하나다.
- **선언 병합 vs 커스텀 타입.** `AuthedRequest` 를 만들어 캐스팅해도 된다. Express 의 관례가 선언 병합이다.

## 6단계에서 무엇이 바뀌었나

**4.5 에서 깨진 약속이 여기서는 지켜졌다.** 4단계는 "저장소만 교체하고 라우터는 건드리지 않는다" 고
적어 놓고 동기 함수를 비동기로 바꾸는 바람에 라우터 3개가 전부 바뀌었다. 6.4 는 인증 방식을 통째로
갈아 끼웠는데 고친 파일이 이 하나다 — `routes/posts.ts` 와 `routes/comments.ts` 는 한 줄도 바뀌지
않았다. 차이는 하나다. **헤더 이름도 토큰 형식도 이 파일 밖으로 새지 않게 처음부터 막아 두었다.**

| | 5단계까지 | 6단계 |
|---|---|---|
| 읽는 헤더 | `x-user-id` | `Authorization: Bearer <JWT>` |
| 헤더 값 | 유저 id 그 자체 | 서명된 토큰 |
| 모양 검사 | uuid 정규식 | **없다** — 서명 검증 안으로 들어갔다 |
| 신원 확인 | `users.findById(id)` (매 요청 DB 조회) | `verifyToken(token, "access")` (조회 없음) |
| 위조 | 남의 id 를 적으면 그 사람이 된다 | 서명이 맞지 않으면 신원이 비어 401 |
| 만료 | 없다 | `exp` 를 `jose` 가 검사한다 |
| 함수 | 동기 | `async` |

**uuid 정규식이 사라진 것**이 이 표의 핵심이다. 값의 모양을 따로 볼 필요가 없어졌다 — 모양이 틀린
토큰은 서명 검증에서 그대로 떨어진다. 검사를 하나 더 붙인 것이 아니라 **검사할 자리를 옮긴 것**이다.

실제로 재 본 값이다. 액세스 토큰은 점 2개로 나뉜 192자이고, 페이로드 키는 `exp,iat,sub,typ` 넷뿐,
이메일 문자열은 0건이었다. 401 을 내야 하는 네 경우 — 토큰 없음 · 만료된 토큰 · 남의 키로 서명한
토큰 · 서명을 잘라낸 토큰 — 전부 401 이었다. 6단계 게이트 24항목이 **24 통과 · 0 실패**,
3~5단계 회귀가 **40 통과 · 0 실패**다.

## 직접 해 볼 것

1. `currentUser` 의 이른 `return` 을 `throw new UnauthenticatedError()` 로 바꾼다 → 헤더 없는
   `GET /posts` 가 401 을 내고 `docs/02-api.md` 2.2 의 인증 "—" 행들과 어긋나는 것을 확인한다.
2. 유저 둘을 만들고 A 의 글을 `DELETE` 할 때 B 의 액세스 토큰을 쓴다 → 403 `FORBIDDEN`.
   A 의 토큰이면 204, `Authorization` 헤더를 빼면 401. 세 응답의 차이가 401/403 의 정의다.
3. 토큰 가운데 점 뒤 서명 부분을 한 글자 지워 보낸다 → 401. 페이로드만 바꿔 치기해도 401 이다.
   서명이 무엇을 지키는지 보이는 자리다.
4. `verifyToken(..., "access")` 의 `"access"` 를 `"refresh"` 로 바꾼다 → 정상 액세스 토큰이 전부
   401 이 된다. `typ` 가 하는 일을 눈으로 보는 자리다.

## 다음 단계에서 어떻게 바뀌는가

- **6.3 — 끝났다.** 로그인이 유저 id 대신 서명된 JWT 를 발급한다. 응답의 `token` 필드 이름은 그대로다.
- **6.4 — 끝났다.** 이 파일이 `Authorization: Bearer <token>` 을 읽어 서명과 만료를 검증하고
  payload 의 `sub` 를 `req.user.id` 에 넣는다. 막는 것은 여전히 `requireAuth` 한 곳이다.
- **6.5 / 6.6 — 끝났다.** 소유권 검사가 403 담당으로 정리되고, `docs/02-api.md` 2.5 의 "존재 검사가
  권한 검사보다 먼저" 규칙이 라우터에 반영됐다.
- **9.1** — `JWT_SECRET` 을 포함한 환경변수를 zod 로 전부 검증한다. 지금은 없으면 시작할 때 던진다.
