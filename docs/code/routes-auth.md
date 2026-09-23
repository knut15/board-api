# server/src/routes/auth.ts

> 커리큘럼 3.5 · 3.6 · 4.5 · 5.2 · 6.1 · 6.2 · 6.3 · 6.7 · 짝: `server/src/routes/auth.ts`

## 무엇을 하는 파일인가

가입 · 로그인 · 토큰 재발급 · 내 정보. `docs/02-api.md` 2.2 표의 1·2·3번과 6.7 에서 늘어난 12번이다.
라우터를 둘 내보낸다 — `authRouter` 는 `/auth` 에, `meRouter` 는 `/me` 에 붙는다. `/auth/me` 로 두지
않은 것은 2.1 의 URL 규칙 4번 때문이다: `/auth/*` 는 "행위" 경로의 예외이고 내 정보는 리소스 조회다.

## 코드를 따라 읽기

가입 핸들러에 남은 판단은 하나뿐이다.

```ts
authRouter.post("/signup", validate({ body: SignupBody }), async (req, res) => {
  const { email, password, nickname } = validBody<SignupBody>(req);
  if (await users.findByEmail(email)) {
    throw new ConflictError("EMAIL_ALREADY_EXISTS", "이미 가입된 이메일입니다.");
  }
  // 평문은 여기서 끝이다. 아래로 내려가지 않고, 로그에도 DB 에도 남지 않는다.
  const passwordHash = await hashPassword(password);
  const user = await users.create({ email, passwordHash, nickname });
  res.status(201).json(await userView(user.id));
});
```

검사 순서가 응답 코드를 정하고, 그 순서를 **라우터 한 줄이 그린다.** 형식(`400`)과 값(`422`)의 판정은
`middleware/validate.ts` 의 `toError` 가 하고 핸들러에는 `409` 판단만 남았다. **평문 `password` 가
지나는 구간은 이 세 줄뿐이다** — 그 아래로는 `passwordHash` 만 흘러간다.

로그인 실패는 한 덩어리로 묶는다.

```ts
const user = await users.findByEmail(email);
const ok = user
  ? await verifyPassword(user.passwordHash, password)
  : await verifyPassword("$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA", password);
if (!user || !ok) {
  throw new AppError(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 맞지 않습니다.");
}
```

`!user`(없는 이메일)와 비밀번호 불일치를 **구분하지 않는다.** 구분하면 이메일 목록을 들고 이
엔드포인트를 두들겨 누가 가입했는지 알아낼 수 있다(6.2). 같은 이유로 `LoginBody` 는 `email` 을
`z.string()` 으로 받는다 — 형식 오류에 `400` 을 주면 그 응답이 곧 "이 값은 이메일이 아니다" 라는 답이다.

**없는 이메일일 때도 더미 해시를 한 번 돌린다.** 건너뛰면 응답이 빨라진다. argon2 는 일부러 느리게
만든 함수라 그 차이가 크고, 본문이 같은 401 이어도 **응답 시간만으로 가입 여부가 드러난다.**

`POST /auth/refresh` 는 6.7 에서 늘어난 12번이다.

```ts
authRouter.post("/refresh", async (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!token) throw new UnauthenticatedError("리프레시 토큰이 없습니다.");
  const userId = await verifyToken(token, "refresh");
  // 토큰은 멀쩡한데 계정이 사라졌을 수 있다. 서명만 믿지 않고 한 번 확인한다.
  const user = await users.findById(userId);
  if (!user) throw new UnauthenticatedError("계정을 찾을 수 없습니다.");
  await issueTokens(res, user.id);
  res.json({ token: await signAccessToken(user.id), user: await userView(user.id) });
});
```

읽는 곳이 `req.body` 도 `Authorization` 헤더도 아니라 **쿠키**다. `httpOnly` 쿠키는 자바스크립트가
읽지 못하므로 페이지에 끼어든 스크립트가 가져갈 경로가 막힌다. 대신 쿠키는 자동으로 실려 가서
`sameSite: "strict"` 로 CSRF 를 따로 막는다(`server/src/auth/tokens.ts`). 종류를 `"refresh"` 로 못
박는 것은 액세스 토큰으로 재발급받는 것을 막기 위해서다. `issueTokens` 는 매번 새 리프레시 토큰을
쿠키에 덮어쓴다(rotation) — 옛 토큰이 새어 나가도 쓸 수 있는 기간이 그만큼 짧아진다.

## 왜 이렇게 했는가

**`throw` 는 그 자리에서 함수를 벗어난다.** `fail(res, …)` 는 함수를 멈추지 않아서 `return` 을
빠뜨리면 두 번째 응답에서 `ERR_HTTP_HEADERS_SENT` 가 났다. 그 사고의 자리가 사라졌다. **응답은
`userView()` 로만 만든다** — `res.json(user)` 는 `passwordHash` 를 그대로 내보낸다(`views.md`).

## 3단계에서 무엇이 바뀌었나

커리큘럼 4.5 는 "저장소만 교체한다. 라우터는 한 줄도 건드리지 않는다" 고 적었지만 **지켜지지 않았다.**
핸들러 3개가 전부 `async` 가 됐고 저장소 호출과 `userView` 앞에 `await` 가 붙었다. **상태 코드와 분기는
한 줄도 바뀌지 않았다** — 회귀 36가지를 DB 위에서 다시 돌려 36 통과 · 0 실패였다. 3단계 저장소를 동기
함수로 만든 탓이다. **교훈:** 저장소가 원격이 될 것을 안다면 경계를 처음부터 비동기로 둔다.

## 5단계에서 무엇이 바뀌었나

검증과 에러 응답이 둘 다 라우터 밖으로 나갔다. 검사 `if` 가 `SignupBody`·`LoginBody` 로 가 라우터
3개를 합쳐 검증 `if` 가 **0개**, `fail()` 호출도 **0개**가 됐다. 4xx·5xx 바디를 만드는 곳은
`errorHandler.ts` 하나이고, Express 5 가 `async` 핸들러의 `throw` 를 거기까지 넘긴다. 잘못된 입력
12종과 누출 검사 4종 **16종 전부 통과**, 회귀 **40 통과 · 0 실패**였다.

## 6단계에서 무엇이 바뀌었나

| | 5단계까지 | 6단계 |
|---|---|---|
| 가입 저장 | `users.create({ email, password, … })` | `hashPassword` 를 거친 `passwordHash` |
| 비밀번호 비교 | `user.password !== password` | `await verifyPassword(user.passwordHash, password)` |
| 없는 이메일 | 비교를 건너뛴다 | 더미 해시를 한 번 돌린다 |
| 발급하는 토큰 | `token: user.id` | `await signAccessToken(user.id)` |
| 엔드포인트 | 1·2·3번 | **12번 `POST /auth/refresh` 가 늘었다** |
| 리프레시 토큰 | 없다 | `httpOnly` 쿠키 |

실제로 재 본 값이다. argon2 해시는 `$argon2id$v=19$m=65536,p=4,t=3$…` 모양의 97자이고 두 계정의 해시가
서로 달랐다(salt). DB 의 `passwordHash` 에서 평문 `password123` 은 0건이다. 액세스 토큰은 점 2개로
나뉜 192자, 페이로드 키는 `exp,iat,sub,typ` 넷뿐이고 이메일 문자열은 0건이다. 6단계 게이트 24항목
**24 통과 · 0 실패**, 3~5단계 회귀 **40 통과 · 0 실패**, 완성 시나리오 다섯 줄(가입 → 로그인 → 글
작성 → 댓글 → 남의 글 수정 403) 전부 통과다.

## 9단계에서 무엇이 바뀌었나

### 13. `POST /auth/logout`

로그아웃이 서버까지 가지 않아서 붙였다. 프론트가 액세스 토큰을 버려도 **리프레시 쿠키는
그대로 남아** 있었고, 같은 브라우저에서 `POST /auth/refresh` 를 부르면 새 토큰이 나왔다.
화면상으로는 로그아웃인데 서버가 보기엔 아직 로그인한 사람이었다.

```ts
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions);
  res.status(204).end();
});
```

정한 것이 셋이다.

**`requireAuth` 를 붙이지 않았다.** 액세스 토큰이 만료된 사람도 로그아웃할 수 있어야 한다.
만료를 이유로 `401` 을 주면 쿠키가 살아남고 그 사람은 영영 로그아웃하지 못한다. 로그아웃은
권한이 필요한 일이 아니다 — **가진 것을 버리는 일**이라 가진 게 없어도 된다.

**쿠키가 없어도 `204` 다.** 이미 로그아웃된 사람이 한 번 더 눌렀을 때 `400` 을 주면, 프론트는
"실패했다" 고 판단할 근거가 생기고 실제로는 아무 문제가 없다. 결과가 같으면 같은 답을 준다.

**`204` 지 `200` 이 아니다.** 돌려줄 것이 없다. 이 요청의 결과는 본문이 아니라 응답 헤더의
`Set-Cookie` 다.

### 지우는 옵션을 따로 만든 이유

브라우저는 이름만으로 쿠키를 가리지 않는다. **`path`·`sameSite`·`secure` 까지 같아야 같은
쿠키다.** 하나라도 다르면 지워지지 않는데, 응답은 `204` 로 성공이다 — 조용히 실패한다.

그래서 `tokens.ts` 가 `cookieScope` 하나에서 심는 값과 지우는 값을 함께 만든다. 지울 때만
`maxAge` 를 뺀다. 만료 시각을 과거로 넣는 것이 "지운다" 의 실제 구현이라 남은 수명을 같이
보내면 서로 싸운다.

```
Set-Cookie: refresh_token=; Path=/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict
```

### 이것으로 안 되는 것

지워지는 것은 **이 브라우저의 쿠키**다. 리프레시 토큰이 이미 새어 나갔다면 그 토큰은 만료까지
14일을 산다. 서명이 유효하고 사용자가 존재하면 `refresh` 가 통과시킨다.

막으려면 서버가 상태를 들어야 한다. 제일 싼 방법은 `users` 에 `sessionsValidFrom` 같은 시각
컬럼을 두고, 로그아웃할 때 지금 시각으로 올린 뒤 `refresh` 에서 토큰의 `iat` 와 비교하는 것이다.
컬럼 하나와 비교 한 줄이면 된다.

**지금은 하지 않았다.** 토큰을 상태 없이 검증하는 것이 6단계에서 고른 성질이고, 그것을 깨는
결정은 그럴 이유가 생겼을 때 하는 편이 낫다. 다만 "로그아웃했으니 안전하다" 고 말하지는 않는다 —
안전한 것은 **이 브라우저에서 내려왔다** 까지다.

## 직접 해 볼 것

1. `POST /auth/signup` 에 `password` 를 숫자 `12345678` 로 보낸다. 8자리인데 `400` 이다(타입 불일치는
   `FORMAT_ISSUES`). 문자열 `"1234567"` 로 바꾸면 `422` 다.
2. 더미 해시 줄을 지우고 없는 이메일과 틀린 비밀번호의 응답 시간을 잰다. 차이를 확인한 뒤 되돌린다.
3. 로그인 응답의 `token` 가운데 조각을 base64 로 푼다. `sub`·`exp`·`iat`·`typ` 만 있고 이메일이 없다.
4. 쿠키를 지우고 `POST /auth/refresh` 를 부른다 → 401. 쿠키를 두면 새 액세스 토큰과 새 쿠키가 온다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 5.2 | **끝났다.** 검사가 `SignupBody`·`LoginBody` + `validate` 로 갔고 핸들러의 검증 `if` 가 0개다 |
| 5.5 | **끝났다.** `fail()` 이 `throw` 가 됐고 Express 5 가 그것을 에러 핸들러로 넘긴다 |
| 6.1 | **끝났다.** 저장·비교가 argon2 `hashPassword`/`verifyPassword` 로 바뀌었다 |
| 6.3 | **끝났다.** `token: user.id` 가 `signAccessToken` 이 만든 JWT 다. 필드 이름은 그대로다 |
| 6.7 | **끝났다.** `POST /auth/refresh` 가 늘고 리프레시 토큰이 `httpOnly` 쿠키로 내려간다 |
