// 문서: docs/code/store-comments.md · 커리큘럼 3.4 · 4.5 · 4.6
//
// 댓글은 오래된 것부터 본다. 읽는 순서가 대화 순서이기 때문이다.

import { prisma } from "./prisma.js";

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: Date;
};

export function create(input: {
  postId: string;
  authorId: string;
  body: string;
}): Promise<Comment> {
  return prisma.comment.create({ data: input });
}

export function findById(id: string): Promise<Comment | null> {
  return prisma.comment.findUnique({ where: { id } });
}

export async function findManyByPostId({
  postId,
  limit,
  cursor,
}: {
  postId: string;
  limit: number;
  cursor?: string;
}): Promise<{ items: Comment[]; nextCursor: string | null; hasNext: boolean }> {
  const rows = await prisma.comment.findMany({
    where: { postId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasNext = rows.length > limit;
  const items = hasNext ? rows.slice(0, limit) : rows;

  return { items, nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null, hasNext };
}

// 목록 응답의 commentCount 를 만든다. 3단계에서는 글마다 댓글 전체를 훑었고,
// 지금은 글마다 COUNT 쿼리가 한 번씩 나간다. 여전히 글 수만큼이다 — 이것이 4.6 에서 셀 N+1 이고,
// 7.7 에서 _count 한 번으로 바뀐다.
export function countByPostId(postId: string): Promise<number> {
  return prisma.comment.count({ where: { postId } });
}

// P2025 를 잡지 않는다. 번역은 errorHandler 한 곳에서 한다(5.7).
export async function remove(id: string): Promise<void> {
  await prisma.comment.delete({ where: { id } });
}
