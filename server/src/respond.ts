// 문서: docs/code/respond.md · 커리큘럼 2.4 · 3.6 · 5.6
//
// 에러 응답 바디를 만든다. docs/02-api.md 2.4 의 형태를 코드로 옮긴 것이다.
//
// 5단계에서 부르는 곳이 하나로 줄었다. 라우터는 이제 throw 만 하고,
// 이 함수는 errorHandler 안에서만 쓰인다.

import type { Response } from "express";

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null,
) {
  res.status(status).json({ error: { code, message, details } });
}
