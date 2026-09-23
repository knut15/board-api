// 문서: docs/code/web-application.md · 레이어: application

import type { CommentRepository } from "../ports/repositories";
import { assertValidCommentInput } from "@/domain/comment/policy";

export const listComments =
  (repo: CommentRepository) => (params: { postId: string; limit?: number; cursor?: string }) =>
    repo.listByPost(params);

export const addComment =
  (repo: CommentRepository) => (input: { postId: string; body: string }) => {
    assertValidCommentInput(input.body);
    return repo.create(input);
  };

export const deleteComment = (repo: CommentRepository) => (id: string) => repo.remove(id);
