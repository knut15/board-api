// 문서: docs/code/validate.md · 커리큘럼 5.1 · 5.2 · 5.3
//
// 검증을 라우터에 끼우는 미들웨어 하나. 이 파일이 생기고 나면
// 핸들러 안에 if (!title) return res.status(400) 같은 줄이 하나도 남지 않는다.

import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { BadRequestError, UnprocessableError, type ErrorDetail } from "../errors.js";

// 검증을 통과한 값을 여기에 담는다.
// Express 5 의 req.query 는 읽기 전용 getter 라서 파싱 결과를 되돌려 넣을 수 없다.
// 원본은 그대로 두고 검증된 값을 따로 들고 다니는 쪽이 안전하기도 하다 —
// 핸들러가 req.valid 를 쓰면 "검증을 거친 값" 이라는 것이 타입에 드러난다.
declare global {
  namespace Express {
    interface Request {
      valid?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const valid: NonNullable<Request["valid"]> = {};
    const bodyIssues: z.core.$ZodIssue[] = [];
    const locationIssues: z.core.$ZodIssue[] = [];

    for (const key of ["body", "query", "params"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) valid[key] = result.data;
      else (key === "body" ? bodyIssues : locationIssues).push(...result.error.issues);
    }

    if (bodyIssues.length + locationIssues.length > 0) {
      next(toError(bodyIssues, locationIssues));
      return;
    }

    req.valid = valid;
    next();
  };
}

// 400 과 422 를 가르는 선. docs/02-api.md 2.3 의 표를 코드로 옮긴 것이다.
//
// 규칙이 둘이다.
// 1. 쿼리·경로 파라미터의 문제는 언제나 400 이다. 주소에 실려 오는 값이라 형식의 문제로 본다.
//    limit=999 도 400 이다 — 값이 범위를 벗어난 것이지만 주소가 잘못 만들어진 것이기도 하다.
// 2. 본문만 형식(400)과 값(422)을 가른다. 판정은 zod 이슈 코드로 기계적으로 한다.
const FORMAT_ISSUES = new Set([
  "invalid_type", // 타입 불일치, 필드 누락
  "invalid_value", // enum 에 없는 값
  "invalid_format", // uuid·email 형식 아님
  "unrecognized_keys", // 모르는 필드
]);

function toError(bodyIssues: z.core.$ZodIssue[], locationIssues: z.core.$ZodIssue[]) {
  const all = [...locationIssues, ...bodyIssues];
  const details: ErrorDetail[] = all.map((i) => ({
    path: i.path.join(".") || "(root)",
    rule: i.code,
  }));

  // 메시지는 사람이 읽는 것이다. 프론트는 code 와 details 로 분기한다.
  const message = all[0]?.message ?? "요청 형식이 올바르지 않습니다.";

  // 한 요청에 여러 문제가 섞이면 400 이 이긴다.
  // 형식부터 틀린 것을 값 문제로 보고할 이유가 없다.
  const is400 = locationIssues.length > 0 || bodyIssues.some((i) => FORMAT_ISSUES.has(i.code));

  return is400 ? new BadRequestError(message, details) : new UnprocessableError(message, details);
}

// 검증을 통과한 값을 타입과 함께 꺼낸다. 핸들러가 req.body 를 직접 읽지 않게 하는 것이 요점이다 —
// req.body 는 아무거나 들어올 수 있고, req.valid 는 스키마를 통과한 것만 들어 있다.
export const validBody = <T>(req: Request): T => req.valid!.body as T;
export const validQuery = <T>(req: Request): T => req.valid!.query as T;
export const validParams = <T>(req: Request): T => req.valid!.params as T;
