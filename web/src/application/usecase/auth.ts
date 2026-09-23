// 문서: docs/code/web-application.md · 레이어: application

import type { AuthGateway, TokenStorage } from "../ports/repositories";

export const signup =
  (gateway: AuthGateway) => (input: { email: string; password: string; nickname: string }) =>
    gateway.signup(input);

// 로그인 성공의 부수 효과(토큰 저장)를 유스케이스가 책임진다.
// 화면이 저장까지 기억해야 한다면 로그인 경로가 늘어날 때마다 빠뜨릴 곳이 생긴다.
export const login =
  (gateway: AuthGateway, tokens: TokenStorage) =>
  async (input: { email: string; password: string }) => {
    const result = await gateway.login(input);
    tokens.set(result.token);
    return result.user;
  };

export const logout = (tokens: TokenStorage) => () => tokens.clear();

export const getMe = (gateway: AuthGateway) => () => gateway.me();
