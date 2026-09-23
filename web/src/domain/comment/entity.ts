// 문서: docs/code/web-domain.md · 레이어: domain

import type { Author } from "../user/entity";

export type Comment = {
  id: string;
  body: string;
  author: Author;
  createdAt: string;
};
