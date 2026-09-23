// 문서: docs/code/store-posts.md · 커리큘럼 3.4 · 4.5 · 7.3
//
// 목록은 최신순이고 커서로 자른다. 정렬과 자르기를 이제 DB 가 한다 —
// 3단계에서는 호출마다 전부 메모리로 꺼내 sort 했다.

import { prisma } from "./prisma.js";
import type { SortKey } from "../schemas/index.js";

export type Post = {
  id: string;
  authorId: string;
  title: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

// 목록 한 줄. 화면이 필요한 것(작성자 이름·댓글 수)을 함께 들고 온다.
// 7.7 에서 이 모양이 됐다 — 그 전에는 뷰가 글마다 따로 물어봤다.
export type PostListRow = Post & {
  author: { id: string; nickname: string };
  commentCount: number;
};

export function create(input: {
  authorId: string;
  title: string;
  body: string;
}): Promise<Post> {
  return prisma.post.create({ data: input });
}

export function findById(id: string): Promise<Post | null> {
  return prisma.post.findUnique({ where: { id } });
}

export async function findMany({
  limit,
  cursor,
  sort = "createdAt:desc",
  q,
  authorId,
}: {
  limit: number;
  cursor?: string;
  sort?: SortKey;
  q?: string;
  authorId?: string;
}): Promise<{ items: PostListRow[]; nextCursor: string | null; hasNext: boolean }> {
  // sort 는 스키마의 enum 을 통과한 값이라 여기서 다시 검사하지 않는다.
  // 쪼개서 쓰더라도 값의 출처가 허용 목록이라는 것이 중요하다(7.4).
  const [field, dir] = sort.split(":") as ["createdAt", "asc" | "desc"];

  const rows = await prisma.post.findMany({
    where: {
      // 7.5 — 제목 검색. contains 는 LIKE '%q%' 가 되어 인덱스를 타지 못한다.
      // 1만 건에서 얼마나 걸리는지 재 보는 것이 이 단계의 목적이다.
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
      ...(authorId ? { authorId } : {}),
    },
    // 정렬 키가 같은 글이 있으면 순서가 흔들린다. id 로 한 번 더 가른다.
    orderBy: [{ [field]: dir }, { id: dir }],
    // 한 건 더 떠서 다음 페이지가 있는지 본다. COUNT(*) 로 전체를 세는 것보다 싸다.
    take: limit + 1,
    // skip: 1 은 커서가 가리키는 글 자신을 건너뛴다는 뜻이다.
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    // 7.7 — 작성자와 댓글 수를 같은 쿼리에서 가져온다.
    // 그 전에는 뷰가 글마다 따로 물어봐서 쿼리가 글 수만큼 늘었다.
    include: {
      author: { select: { id: true, nickname: true } },
      _count: { select: { comments: true } },
    },
  });

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;
  const items: PostListRow[] = page.map(({ _count, ...row }) => ({
    ...row,
    commentCount: _count.comments,
  }));

  return { items, nextCursor: hasNext ? (items.at(-1)?.id ?? null) : null, hasNext };
}

// 5단계 전에는 여기서 P2025(레코드 없음)를 잡아 null 로 바꿨다.
// 지금은 잡지 않고 그대로 던진다 — Prisma 에러를 우리 말로 옮기는 곳은
// errorHandler 하나뿐이다(5.7). 같은 번역이 두 곳에 있으면 언젠가 갈라진다.
//
// 라우터는 고치기 전에 findById 로 존재를 확인하므로 P2025 는 거의 나지 않는다.
// 확인과 수정 사이에 남이 그 글을 지운 경우에만 나고, 그때 404 가 나가는 것이 맞다.
export function update(id: string, patch: { title?: string; body?: string }): Promise<Post> {
  return prisma.post.update({
    where: { id },
    data: { title: patch.title, body: patch.body },
  });
}

export async function remove(id: string): Promise<void> {
  // 딸린 댓글은 DB 가 걷어 간다 — comments.postId 의 ON DELETE CASCADE(4.3).
  // 3단계에서 손으로 하던 일이고, 이제 한 문장 안에서 원자적으로 끝난다.
  await prisma.post.delete({ where: { id } });
}
