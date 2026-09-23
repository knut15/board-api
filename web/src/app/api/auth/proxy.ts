// 문서: docs/code/web-auth-proxy.md · 커리큘럼 8.7 · 6.7
//
// 쿠키를 다루는 일만 REST 한 겹으로 따로 뺐다.
//
// 리프레시 토큰은 httpOnly 쿠키다. 쿠키는 HTTP 의 것이고 GraphQL 은 그것을 모른다 —
// Yoga 응답에 Set-Cookie 를 끼워 넣을 수는 있지만, 그러려면 리졸버가 응답 객체를 알아야 하고
// "스키마가 곧 계약" 이라는 성질이 깨진다.
//
// 그래서 로그인과 재발급만 /api/auth/* 로 내보낸다. 나머지는 전부 GraphQL 이다.

const BASE = process.env.BOARD_API_URL ?? "http://localhost:4000";

export async function proxyAuth(request: Request, path: string): Promise<Response> {
  const upstream = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // 브라우저 → Next 로 온 쿠키를 Express 로 그대로 넘긴다.
      // 이 줄이 없으면 재발급이 "리프레시 토큰이 없습니다" 로 끝난다.
      ...(request.headers.get("cookie") ? { cookie: request.headers.get("cookie")! } : {}),
    },
    body: await request.text(),
    cache: "no-store",
  });

  const body = await upstream.text();
  const headers = new Headers({ "Content-Type": "application/json" });

  // Express 가 심은 Set-Cookie 를 브라우저로 옮긴다. 옮기지 않으면 브라우저는
  // 리프레시 토큰을 받지 못하고, 액세스 토큰이 만료되면 다시 로그인해야 한다.
  //
  // 쿠키의 Domain 은 손대지 않는다. Express(4000)와 Next(3001)는 포트만 다르고
  // 쿠키는 포트를 가리지 않으므로 그대로 붙는다. Path=/auth 는 Express 가 정한 값이라
  // 브라우저는 /auth 로 시작하는 요청에만 이 쿠키를 싣는다 — 그래서 아래에서 /api/auth 로 고친다.
  for (const raw of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", raw.replace("Path=/auth", "Path=/api/auth"));
  }

  return new Response(body, { status: upstream.status, headers });
}
