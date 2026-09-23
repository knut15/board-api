// 문서: docs/code/error-handler.md · 커리큘럼 5.6 · 5.7
//
// 에러를 HTTP 응답으로 바꾸는 유일한 곳이다.
// 이 파일 밖에서 4xx·5xx 바디를 만드는 코드는 없어야 한다.
//
// Express 가 인자 4개짜리 함수를 에러 핸들러로 알아본다. _next 를 쓰지 않아도 지워선 안 된다 —
// 지우는 순간 평범한 미들웨어가 되어 에러가 여기로 오지 않는다.
// Express 5 는 async 핸들러가 던진 것도 자동으로 여기로 보낸다.

import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import { fail } from "../respond.js";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // 응답이 이미 나가기 시작했으면 헤더를 다시 쓸 수 없다. Express 기본 처리에 넘긴다.
  if (res.headersSent) {
    _next(err);
    return;
  }

  if (err instanceof AppError) {
    fail(res, err.status, err.code, err.message, err.details);
    return;
  }

  // express.json() 이 던지는 파싱 에러. 바디가 JSON 이 아니면 라우터까지 오지도 못한다.
  // docs/02-api.md 2.3 이 "JSON 파싱 실패" 를 400 으로 정해 두었다.
  // 이 에러의 message 에는 깨진 본문 일부가 들어 있어 그대로 내보내지 않는다.
  if (isBodyParseError(err)) {
    fail(res, 400, "VALIDATION_FAILED", "요청 본문이 올바른 JSON 이 아닙니다.");
    return;
  }

  const translated = translatePrisma(err);
  if (translated) {
    fail(res, translated.status, translated.code, translated.message);
    return;
  }

  // 여기까지 온 것은 우리가 예상하지 못한 에러다.
  // 안쪽은 서버 로그에만 남기고, 밖으로는 아무것도 흘리지 않는다.
  // req.log 로 찍으면 요청 id 가 함께 남아 어느 요청이 죽었는지 이을 수 있다(9.5).
  req.log.error({ err }, "unhandled error");
  fail(res, 500, "INTERNAL_ERROR", "서버에서 문제가 생겼습니다.");
}

function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type: unknown }).type === "entity.parse.failed"
  );
}

// 5.7 — Prisma 에러를 우리 말로 옮긴다.
// 라이브러리 메시지를 그대로 내보내면 테이블명·컬럼명·쿼리가 응답에 실려 나간다.
//
// instanceof 대신 모양으로 알아본다. Prisma 7 은 드라이버 어댑터를 거치면서
// 에러 클래스가 여러 경로로 만들어지는데, code 는 어느 경로로 와도 같다.
function translatePrisma(err: unknown): { status: number; code: never | string; message: string } | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const code = (err as { code: unknown }).code;
  if (typeof code !== "string" || !/^P\d{4}$/.test(code)) return null;

  switch (code) {
    case "P2002": // 유니크 제약 위반
      return { status: 409, code: "EMAIL_ALREADY_EXISTS", message: "이미 가입된 이메일입니다." };
    case "P2025": // 조건에 맞는 레코드가 없음
      return { status: 404, code: "POST_NOT_FOUND", message: "대상을 찾을 수 없습니다." };
    case "P2003": // 외래키 위반 — 가리키는 글이나 유저가 없다
      return { status: 404, code: "POST_NOT_FOUND", message: "글을 찾을 수 없습니다." };
    default:
      // 모르는 Prisma 에러는 500 으로 보낸다. 그쪽이 안전하다 —
      // 원문을 내보내면 스키마 구조가 새어 나간다.
      return null;
  }
}
