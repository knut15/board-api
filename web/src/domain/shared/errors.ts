// 문서: docs/code/web-domain.md · 레이어: domain
//
// 도메인 에러. 어떤 라이브러리도 import 하지 않는다 — 브라우저와 BFF 양쪽에서 그대로 돈다.
// 서버(docs/02-api.md 2.4)의 error.code 와 이름을 맞춘다.

export type DomainErrorCode =
  | "VALIDATION_FAILED"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "POST_NOT_FOUND"
  | "COMMENT_NOT_FOUND"
  | "ROUTE_NOT_FOUND"
  | "INTERNAL_ERROR";

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

// 화면이 이 둘을 구분해야 한다. 401 은 로그인 화면으로 보내고 403 은 보내지 않는다.
export const isUnauthenticated = (e: unknown) =>
  e instanceof DomainError && e.code === "UNAUTHENTICATED";
export const isForbidden = (e: unknown) => e instanceof DomainError && e.code === "FORBIDDEN";
