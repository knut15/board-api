// 문서: docs/code/web-application.md · 레이어: application
//
// 포트다. 유스케이스가 "무엇이 필요한지" 만 적고, "어떻게 가져오는지" 는 적지 않는다.
// 구현은 infrastructure 에 있고, 둘을 잇는 일은 composition 이 한다.
// 이 파일이 GraphQL 을 모르는 것이 핵심이다 — 나중에 REST 직접 호출로 바꿔도 여기는 그대로다.

import type { Page, Post, PostSummary } from "@/domain/post/entity";
import type { Comment } from "@/domain/comment/entity";
import type { User } from "@/domain/user/entity";

// 목록을 거르고 정렬하는 조건. 서버 명세(docs/02-api.md)의 쿼리 파라미터와 이름을 맞춘다.
export type PostFilter = {
  sort?: "createdAt:desc" | "createdAt:asc";
  q?: string;
  authorId?: string;
};

export type PostRepository = {
  list(params: { limit?: number; cursor?: string } & PostFilter): Promise<Page<PostSummary>>;
  findById(id: string): Promise<Post>;
  create(input: { title: string; body: string }): Promise<Post>;
  update(id: string, patch: { title?: string; body?: string }): Promise<Post>;
  remove(id: string): Promise<void>;
};

export type CommentRepository = {
  listByPost(params: { postId: string; limit?: number; cursor?: string }): Promise<Page<Comment>>;
  create(input: { postId: string; body: string }): Promise<Comment>;
  remove(id: string): Promise<void>;
};

export type AuthGateway = {
  signup(input: { email: string; password: string; nickname: string }): Promise<User>;
  login(input: { email: string; password: string }): Promise<{ token: string; user: User }>;
  // 8.7 — 액세스 토큰이 만료됐을 때 리프레시 쿠키로 새것을 받는다.
  refresh(): Promise<{ token: string; user: User }>;
  // 리프레시 쿠키는 httpOnly 라 **서버만 지울 수 있다.** 그래서 로그아웃이 요청이다.
  logout(): Promise<void>;
  me(): Promise<User>;
};

// 토큰을 어디에 두는지(지금은 localStorage)를 유스케이스가 모르게 한다.
// 커리큘럼 6.7 에서 httpOnly 쿠키로 옮길 때 이 포트의 구현만 바뀐다.
export type TokenStorage = {
  get(): string | null;
  set(token: string): void;
  clear(): void;
  // 값이 바뀌면 듣는 쪽에 알린다. 화면이 토큰 유무로 갈리는데 저장만 하고 알리지 않으면
  // 아무도 바뀐 것을 모른다 — 로그아웃이 새로고침해야 보이던 이유가 이것이었다.
  subscribe(listener: () => void): () => void;
};
