# web/src/app/api/auth/proxy.ts

> 레이어: BFF (Next 서버) · 커리큘럼 8.7 · 6.7 · 짝: `web/src/app/api/auth/proxy.ts`,
> `web/src/app/api/auth/login/route.ts`, `web/src/app/api/auth/refresh/route.ts`,
> `web/src/infrastructure/auth/authApi.ts`

## 무엇을 하는 파일인가

로그인과 재발급 **둘만** GraphQL 밖으로 빼 놓은 REST 한 겹이다. 이유는 하나 — 쿠키다.
리프레시 토큰은 `httpOnly` 쿠키로 오가는데(6.7), 쿠키는 HTTP 의 것이고 GraphQL 은 그것을 모른다.

```
[브라우저] POST /api/auth/login      ── 나머지 전부는 POST /api/graphql
              │  cookie 를 실어 보냄
              ▼
[Next 서버] proxy.ts — 쿠키를 양쪽으로 옮긴다
              │  cookie 헤더 전달
              ▼
[Express]  POST /auth/login → Set-Cookie: refresh_token=...; Path=/auth
```

## 코드를 따라 읽기

### 쿠키를 두 방향으로 옮긴다

```ts
...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
```

올라가는 쪽이다. `fetch` 는 브라우저가 붙여 준 쿠키를 자동으로 이어 주지 않는다 — Next 서버가
새로 만드는 요청이라 브라우저와 아무 관계가 없다. 이 줄이 없으면 재발급이 언제나
"리프레시 토큰이 없습니다" 로 끝난다(`server/src/routes/auth.ts` 의 첫 검사).

```ts
for (const raw of upstream.headers.getSetCookie()) {
  headers.append("set-cookie", raw.replace("Path=/auth", "Path=/api/auth"));
}
```

내려오는 쪽이다. `headers.get("set-cookie")` 이 아니라 `getSetCookie()` 를 쓴다 —
`Set-Cookie` 는 여러 줄로 올 수 있는 헤더이고, `get` 은 그것을 쉼표로 이어 붙인 문자열 하나로 준다.
쿠키 값 안에도 쉼표가 있을 수 있어 그 문자열은 다시 쪼갤 수 없다.

### `Path` 를 고쳐 심는 한 곳

`Path=/auth` 는 Express 가 정한 값이다(`server/src/auth/tokens.ts` 의 `refreshCookieOptions`).
브라우저는 `Path` 로 시작하는 요청에만 그 쿠키를 싣는데, **브라우저가 부르는 주소는 `/api/auth/*` 다.**
고치지 않으면 쿠키가 심기기는 해도 재발급 요청에 따라가지 않는다.

`Domain` 은 건드리지 않는다. Express(4000)와 Next(3001)는 포트만 다르고 쿠키는 포트를 가리지 않는다.

### 라우트 파일은 세 줄이다

```ts
export const POST = (request: Request) => proxyAuth(request, "/auth/login");
```

`login/route.ts` 와 `refresh/route.ts` 의 차이는 경로 문자열 하나뿐이다. 로직을 `proxy.ts` 한 곳에
두면 쿠키를 다루는 규칙이 두 벌로 갈라지지 않는다.

### 브라우저 쪽은 `authApi.ts` 다

```ts
const res = await fetch(path, { ..., credentials: "same-origin" });
if (!res.ok || !json || "error" in json) {
  const code = (json && "error" in json ? json.error.code : "INTERNAL_ERROR") as DomainErrorCode;
  throw new DomainError(code, message);
}
```

GraphQL 경로가 `extensions.code` 로 하는 일([web-graphql.md](./web-graphql.md))을 여기서는
REST 에러 봉투(`error.code`, [02-api.md](../02-api.md) 2.4)로 한다. 들어오는 모양이 다를 뿐
나가는 것은 같은 `DomainError` 다 — 그래서 화면은 두 경로를 구분하지 않는다.

`credentials: "same-origin"` 은 기본값과 같다. 적어 둔 것은 이 요청이 쿠키를 주고받는다는 사실을
읽는 사람에게 알리려는 것이다.

## 왜 이렇게 했는가

**Yoga 응답에 `Set-Cookie` 를 끼워 넣지 않았다.** 기술적으로는 된다. 대신 리졸버가 응답 객체를 알아야
하고, 그 순간 "스키마가 곧 계약" 이 깨진다 — 스키마만 봐서는 그 뮤테이션이 쿠키를 심는다는 것을 알 수 없다.
치르는 값은 있다. 프론트가 부르는 곳이 두 군데가 되고, 에러를 `DomainError` 로 바꾸는 자리도 두 곳이다.

**액세스 토큰은 여전히 `localStorage` 다.** 6.7 에서 쿠키로 옮긴 것은 리프레시 토큰 하나뿐이다.
둘 다 쿠키로 보내면 모든 요청에 쿠키가 따라가고, `Authorization` 헤더로 분기하던 BFF 가 바뀐다.
남은 위험도 그대로다 — XSS 가 있으면 액세스 토큰은 읽힌다. 대신 유효 기간이 15분이고
리프레시 토큰은 JS 에서 보이지 않는다.

**프록시가 값을 해석하지 않는다.** 본문을 `text()` 로 받아 그대로 넘기고 그대로 돌려준다.
JSON 으로 풀었다가 다시 묶으면 서버가 필드 하나를 늘릴 때 여기도 고쳐야 한다.

## 8단계에서 무엇이 바뀌었나

이 파일들이 8단계에서 생겼다. 확인한 것은 넷이다.

- 로그인 응답이 `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=1209600` 쿠키를 심는다.
  `Path` 가 `/auth` 가 아니라 `/api/auth` 다 — 위의 `replace` 가 실제로 동작한다.
- 쿠키를 들고 재발급하면 `200`, 쿠키 없이 부르면 `401`, **액세스 토큰을 쿠키 자리에 넣어도 `401`** 이다.
  서명 검증에 토큰 종류(`refresh`)가 들어 있어서다(`server/src/auth/tokens.ts`).
- 2초 간격으로 두 번 재발급하니 쿠키 값이 바뀌고 `iat`·`exp` 가 각각 2초씩 밀렸다. rotation 이 돈다.
- **옛 리프레시 토큰으로 다시 재발급해도 `200` 이다.** 서버가 발급한 토큰을 저장하지 않아
  개별 취소를 할 수 없다 — 6.7 에서 남겨 둔 한계가 여기서 그대로 보인다.

401 을 만났을 때 이 재발급을 자동으로 부르는 쪽은 `graphql/client.ts` 이고, 둘을 잇는 배선은
`composition/container.ts` 에 있다([web-composition.md](./web-composition.md)).

## 9단계에서 무엇이 바뀌었나

### `/api/auth/logout` 이 늘었다

REST 로 빼 둔 경로가 둘에서 셋이 됐다. 기준은 처음과 같다 — **쿠키를 다루는 요청만 여기로
온다.** 로그아웃은 서버가 `Set-Cookie` 로 쿠키를 지우게 하는 요청이므로 자격이 있다.

```ts
export const POST = (request: Request) => proxyAuth(request, "/auth/logout");
```

`proxyAuth` 는 한 줄 고쳤다.

```ts
return new Response(body === "" ? null : body, { status: upstream.status, headers });
```

로그아웃은 `204` 고 `204` 에는 본문이 없어야 한다. `Response` 는 **빈 문자열도 "본문이 있다" 로
보고 거부한다.** 붙이자마자 걸린 것이 이것이었다.

`Path` 고쳐 쓰기는 지우는 쿠키에도 그대로 적용된다. Express 가 보낸 `Path=/auth` 가
`Path=/api/auth` 로 바뀌어야 브라우저가 **심을 때와 같은 쿠키로 인식하고** 지운다.

```
set-cookie: refresh_token=; Path=/api/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict
```

## 직접 해 볼 것

1. `proxy.ts` 의 `.replace("Path=/auth", "Path=/api/auth")` 를 지우고 로그인한다.
   개발자 도구 Application → Cookies 에 쿠키는 보이는데, 재발급 요청의 Request Headers 에는
   `cookie` 가 없다. **쿠키가 있는 것과 실려 가는 것은 다른 이야기다.**
2. 올라가는 쪽 `cookie` 전달 줄을 지우고 재발급을 부른다. `401` 과
   "리프레시 토큰이 없습니다" 가 온다 — Next 서버의 `fetch` 는 브라우저의 쿠키를 모른다.
3. `authApi.ts` 의 `post()` 가 던지는 `DomainError` 의 `code` 를 로그로 찍고 틀린 비밀번호로
   로그인한다. `INVALID_CREDENTIALS` 다. GraphQL 경로에서 오는 코드와 같은 목록을 쓴다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 9.x | 배포하면 Express 와 Next 가 다른 호스트일 수 있다. 쿠키의 `Domain` 을 그때 정해야 한다 |
| 9.x | `secure: true` 가 켜진다(`NODE_ENV=production`). https 가 아니면 쿠키가 아예 안 심긴다 |
| 리프레시 저장이 생기면 | 옛 토큰으로도 `200` 이 되는 위의 한계가 사라진다. 서버 쪽 일이고 이 파일은 그대로다 |
