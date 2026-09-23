// 문서: docs/code/web-domain.md · 레이어: domain

import { DomainError } from "../shared/errors";

export const COMMENT_MAX = 1000;

// 댓글은 작성자만 지운다. 글쓴이에게도 권한을 주지 않는다 —
// docs/01-domain.md 의 "안 만들 것" 4번에서 권한 등급을 둘로 못 박았다.
export function canDeleteComment(
  comment: { author: { id: string } },
  viewerId: string | null,
): boolean {
  return viewerId !== null && comment.author.id === viewerId;
}

export function assertValidCommentInput(body: string): void {
  if (body.trim().length === 0) {
    throw new DomainError("VALIDATION_FAILED", "댓글을 입력해 주세요.");
  }
  if (body.length > COMMENT_MAX) {
    throw new DomainError("VALIDATION_FAILED", `댓글은 ${COMMENT_MAX}자까지 쓸 수 있습니다.`);
  }
}
