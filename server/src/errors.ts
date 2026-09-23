// 문서: docs/code/errors.md · 커리큘럼 5.4 · 5.5
//
// 에러를 값으로 만든다. 던지는 쪽은 "무엇이 잘못됐는지" 만 말하고,
// HTTP 상태 코드로 옮기는 일은 이 파일이 한 번만 정해 둔다.
//
// 5단계 전에는 라우터가 fail(res, 404, "POST_NOT_FOUND", ...) 처럼 응답을 직접 만들었다.
// 그 방식은 같은 뜻의 에러가 여러 곳에서 조금씩 다른 모양으로 나가는 것을 막지 못한다.

// docs/02-api.md 2.4 의 목록과 1:1 이다. 여기 없는 code 를 코드베이스에서 만들지 않는다.
export const ERROR_CODES = [
  "VALIDATION_FAILED",
  "EMAIL_ALREADY_EXISTS",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "POST_NOT_FOUND",
  "COMMENT_NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorDetail = { path: string; rule: string };

// 모든 도메인 에러의 뿌리. 상태 코드와 code 를 하나씩 들고 다닌다.
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetail[] | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

// 형식이 틀림 — 타입 불일치, 모르는 필드, uuid 아님, 없는 enum 값
export class BadRequestError extends AppError {
  constructor(message: string, details: ErrorDetail[] | null = null) {
    super(400, "VALIDATION_FAILED", message, details);
  }
}

// 형식은 맞지만 값이 규칙 위반 — 길이 초과, 빈 문자열
export class UnprocessableError extends AppError {
  constructor(message: string, details: ErrorDetail[] | null = null) {
    super(422, "VALIDATION_FAILED", message, details);
  }
}

// 누군지 모름. 로그인 화면으로 보내도 되는 유일한 에러다.
export class UnauthenticatedError extends AppError {
  constructor(message = "로그인이 필요합니다.") {
    super(401, "UNAUTHENTICATED", message);
  }
}

// 누군지는 아는데 권한이 없음. 다시 로그인해도 해결되지 않으므로 로그인 화면으로 보내지 않는다.
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(code: Extract<ErrorCode, `${string}NOT_FOUND`>, message: string) {
    super(404, code, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(409, code, message);
  }
}

// 자주 쓰는 것들은 만들어 두고 이름으로 부른다. 메시지가 흔들리지 않는다.
export const postNotFound = () => new NotFoundError("POST_NOT_FOUND", "글을 찾을 수 없습니다.");
export const commentNotFound = () =>
  new NotFoundError("COMMENT_NOT_FOUND", "댓글을 찾을 수 없습니다.");
export const routeNotFound = () => new NotFoundError("ROUTE_NOT_FOUND", "그런 경로가 없습니다.");
