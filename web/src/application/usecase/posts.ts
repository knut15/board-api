// 문서: docs/code/web-application.md · 레이어: application
//
// 유스케이스. 포트를 받아 도메인 규칙을 적용하고 포트를 부른다.
// react 도 next 도 import 하지 않는다 — 화면 없이도 돌아야 한다.

import type { PostFilter, PostRepository } from "../ports/repositories";
import { assertValidPostInput } from "@/domain/post/policy";

export const listPosts =
  (repo: PostRepository) =>
  (params: { limit?: number; cursor?: string } & PostFilter = {}) =>
    repo.list(params);

export const getPost = (repo: PostRepository) => (id: string) => repo.findById(id);

export const createPost = (repo: PostRepository) => (input: { title: string; body: string }) => {
  // 서버도 같은 검사를 한다. 여기서 먼저 막는 이유는 왕복을 줄이고
  // 입력란 옆에 바로 메시지를 띄우기 위해서다. 서버 검사를 대신하는 것이 아니다.
  assertValidPostInput(input);
  return repo.create(input);
};

export const editPost =
  (repo: PostRepository) => (id: string, patch: { title: string; body: string }) => {
    assertValidPostInput(patch);
    return repo.update(id, patch);
  };

export const deletePost = (repo: PostRepository) => (id: string) => repo.remove(id);
