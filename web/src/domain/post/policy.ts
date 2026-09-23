// 문서: docs/code/web-domain.md · 레이어: domain
//
// 글에 대한 규칙. 서버의 검증(server/src/routes/posts.ts)과 같은 값을 쓴다.
//
// 여기서 내리는 판단은 **화면 표시용**이다. 수정 버튼을 보여 줄지 말지를 정할 뿐,
// 신뢰의 근거가 아니다. 진짜 판정은 서버의 403 이다(docs/04-web-architecture.md).

import { DomainError } from "../shared/errors";

export const TITLE_MAX = 200;

export function canEdit(post: { author: { id: string } }, viewerId: string | null): boolean {
  return viewerId !== null && post.author.id === viewerId;
}

export function assertValidPostInput(input: { title: string; body: string }): void {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new DomainError("VALIDATION_FAILED", "제목을 입력해 주세요.");
  }
  if (input.title.length > TITLE_MAX) {
    throw new DomainError("VALIDATION_FAILED", `제목은 ${TITLE_MAX}자까지 쓸 수 있습니다.`);
  }
  if (input.body.trim().length === 0) {
    throw new DomainError("VALIDATION_FAILED", "본문을 입력해 주세요.");
  }
}
