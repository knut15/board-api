// 문서: docs/code/web-auth-proxy.md · 커리큘럼 8.7
//
// 로그인과 재발급만 GraphQL 이 아니라 /api/auth/* 를 부른다. 쿠키 때문이다(proxy.ts 참고).

import { DomainError, type DomainErrorCode } from "@/domain/shared/errors";
import type { User } from "@/domain/user/entity";

type AuthResult = { token: string; user: User };

async function post(path: string, body?: object): Promise<AuthResult> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    // 쿠키를 주고받으려면 필요하다. 같은 출처라도 기본값이 "same-origin" 이라 되지만,
    // 의도를 드러내려고 적어 둔다.
    credentials: "same-origin",
  });

  const json = (await res.json().catch(() => null)) as
    | AuthResult
    | { error: { code: string; message: string } }
    | null;

  if (!res.ok || !json || "error" in json) {
    const code = (json && "error" in json ? json.error.code : "INTERNAL_ERROR") as DomainErrorCode;
    const message = json && "error" in json ? json.error.message : "요청을 처리하지 못했습니다.";
    throw new DomainError(code, message);
  }
  return json;
}

export const loginRequest = (input: { email: string; password: string }) =>
  post("/api/auth/login", input);

export const refreshRequest = () => post("/api/auth/refresh");

// 로그아웃만 204 라 위 post 를 쓰지 않는다. 돌려받을 것이 없다 —
// 이 요청의 목적은 응답이 아니라 **서버가 Set-Cookie 로 쿠키를 지우게 하는 것**이다.
export async function logoutRequest(): Promise<void> {
  const res = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!res.ok) throw new DomainError("INTERNAL_ERROR", "로그아웃 요청을 처리하지 못했습니다.");
}
