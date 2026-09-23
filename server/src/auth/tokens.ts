// 문서: docs/code/auth-tokens.md · 커리큘럼 6.3 · 6.7
//
// 토큰을 만들고 검증한다. 5단계까지 "토큰" 은 유저 id 그 자체였다 —
// 남의 id 를 적어 보내면 그 사람이 됐다. 여기서 서명과 만료가 붙는다.

import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { UnauthenticatedError } from "../errors.js";
import { env } from "../env.js";

// 있는지·긴지 검사하는 일은 env.ts 가 부팅 맨 앞에서 한다(9.1).
// 기본값을 몰래 넣어 두지 않는다 — 그 값으로 서명된 토큰이 운영에 그대로 통한다.
const key = new TextEncoder().encode(env.JWT_SECRET);

// 알고리즘을 값으로 못 박는다. 검증할 때 토큰이 말하는 alg 를 그대로 믿으면
// alg: "none" 이나 대칭키로 바꿔치기하는 공격이 통한다.
const ALG = "HS256";

const ACCESS_TTL = "15m";
const REFRESH_TTL = "14d";

export type TokenKind = "access" | "refresh";

// 페이로드에는 sub(유저 id)와 exp 만 넣는다.
// **토큰은 서명된 것이지 암호화된 것이 아니다** — 누구나 페이로드를 읽을 수 있다.
// jwt.io 에 붙여 넣어 보면 이메일도 닉네임도 그대로 보인다. 그래서 넣지 않는다.
// typ 를 따로 넣는 이유는 리프레시 토큰으로 API 를 부르는 것을 막기 위해서다.
async function sign(userId: string, kind: TokenKind, ttl: string): Promise<string> {
  return new SignJWT({ typ: kind })
    .setProtectedHeader({ alg: ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(key);
}

export const signAccessToken = (userId: string) => sign(userId, "access", ACCESS_TTL);
export const signRefreshToken = (userId: string) => sign(userId, "refresh", REFRESH_TTL);

export async function verifyToken(token: string, expected: TokenKind): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: [ALG] });
    if (payload.typ !== expected) throw new UnauthenticatedError("토큰 종류가 맞지 않습니다.");
    if (!payload.sub) throw new UnauthenticatedError("토큰에 사용자가 없습니다.");
    return payload.sub;
  } catch (e) {
    if (e instanceof UnauthenticatedError) throw e;
    // 만료도 서명 불일치도 모두 401 이다. 둘을 구분해 알려 주면
    // 서명 키를 맞춰 보는 쪽에 힌트가 된다.
    if (e instanceof joseErrors.JWTExpired) throw new UnauthenticatedError("토큰이 만료됐습니다.");
    throw new UnauthenticatedError("토큰을 확인할 수 없습니다.");
  }
}

// 6.7 — 리프레시 토큰은 httpOnly 쿠키에 둔다.
//
// localStorage 에 두면 페이지에 끼어든 스크립트가 읽어 간다(XSS). httpOnly 쿠키는
// 자바스크립트가 아예 읽지 못하므로 그 경로가 막힌다. 대신 쿠키는 자동으로 실려 가므로
// CSRF 를 따로 막아야 한다 — sameSite: "strict" 가 그 몫이다.
//
// 액세스 토큰을 짧게(15분) 두는 이유도 같다. 어차피 메모리나 localStorage 에 두게 되는데,
// 새어 나가도 15분 뒤에는 쓸모가 없다.
export const REFRESH_COOKIE = "refresh_token";

// 브라우저는 이름만으로 쿠키를 가리지 않는다. **path·sameSite·secure 까지 같아야 같은 쿠키다.**
// 그래서 심는 값과 지우는 값을 한 곳에서 만든다 — 따로 적어 두면 하나만 고치는 날이 오고,
// 그날 로그아웃이 조용히 실패한다(쿠키가 안 지워지는데 응답은 204 다).
const cookieScope = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: env.NODE_ENV === "production",
  path: "/auth",
};

export const refreshCookieOptions = { ...cookieScope, maxAge: 14 * 24 * 60 * 60 * 1000 };

// 지울 때는 maxAge 를 뺀다. 만료 시각을 과거로 넣는 것이 "지운다" 의 실제 구현이라
// 남은 수명을 같이 보내면 서로 싸운다.
export const clearRefreshCookieOptions = cookieScope;
