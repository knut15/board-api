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

// 로그아웃은 두 군데를 내려야 한다. 액세스 토큰은 이쪽(localStorage)에, 리프레시 토큰은
// 저쪽(httpOnly 쿠키)에 있다. 쿠키는 자바스크립트가 읽지도 지우지도 못하므로 서버에 부탁한다.
//
// 순서가 있다. **로컬을 먼저 내린다** — 서버 왕복을 기다리는 동안 화면이 로그인 상태로
// 남아 있으면 "눌렀는데 그대로" 가 되고, 그것이 고치기 전의 증상이었다.
export const logout = (gateway: AuthGateway, tokens: TokenStorage) => async () => {
  tokens.clear();
  await gateway.logout();
};

export const getMe = (gateway: AuthGateway) => () => gateway.me();
