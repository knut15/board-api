// 문서: docs/code/middleware-current-user.md · 커리큘럼 3.6 · 6.4 · 6.5
//
// 요청자를 알아낸다. 5단계까지는 x-user-id 헤더에 적힌 id 를 그대로 믿는 흉내였고,
// 6.4 에서 서명된 토큰을 검증하는 것으로 바뀌었다.
//
// **라우터는 한 줄도 바뀌지 않았다.** 헤더 이름도 토큰 형식도 이 파일 밖으로 새지 않게
// 해 두었기 때문이다. 4.5 에서 지키지 못한 약속을 여기서는 지켰다.

import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../auth/tokens.js";
import { UnauthenticatedError } from "../errors.js";

// Express 의 Request 에 없는 필드를 쓰려면 선언 병합으로 타입을 넓혀야 한다.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export async function currentUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");

  // 헤더가 없어도 통과시킨다. 로그인이 필요 없는 엔드포인트(글 목록·상세)가 있기 때문이다.
  // 여기서 막으면 GET /posts 가 인증을 요구하게 된다.
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  try {
    req.user = { id: await verifyToken(header.slice("Bearer ".length), "access") };
  } catch {
    // 망가진 토큰을 들고 온 것은 "누군지 모름" 이다. 여기서 막지 않고 그냥 신원을 비워 둔다.
    // 로그인이 필요한 자리에서 requireAuth 가 401 을 낸다.
  }
  next();
}

// 로그인이 필요한 라우터에만 끼운다. 401 을 내는 곳은 여기 한 곳이다.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  // 5단계 전에는 여기서 응답을 직접 만들었다. 이제 던지기만 한다 —
  // 401 바디를 만드는 곳은 errorHandler 하나다.
  if (!req.user) throw new UnauthenticatedError();
  next();
}
