// 문서: docs/code/web-domain.md · 레이어: domain

import type { Author } from "../user/entity";
import type { Comment } from "../comment/entity";

export type PageInfo = { nextCursor: string | null; hasNext: boolean };
export type Page<T> = { items: T[]; pageInfo: PageInfo };

// 목록 항목에는 body 가 없다. 서버 명세(docs/02-api.md 2.4)가 그렇게 정해져 있고,
// 타입을 나눠 두면 목록 화면에서 본문을 쓰려는 코드가 컴파일 단계에서 걸린다.
export type PostSummary = {
  id: string;
  title: string;
  author: Author;
  commentCount: number;
  createdAt: string;
};

export type Post = {
  id: string;
  title: string;
  body: string;
  author: Author;
  commentCount: number;
  comments: Page<Comment>;
  createdAt: string;
  updatedAt: string;
};
