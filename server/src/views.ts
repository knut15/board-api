// 문서: docs/code/views.md · 커리큘럼 2.4 · 3.6 · 4.5
//
// 응답 바디를 만드는 곳. docs/02-api.md 2.4 의 예시 JSON 과 이 파일이 1:1 로 대응한다.
//
// 4단계에서 전부 async 가 됐다. 저장소가 Map 에서 DB 로 가면서 조회가 기다림이 됐기 때문이다.
// 이 파일에서 await 가 몇 번 나오는지가 곧 한 응답에 나가는 쿼리 수다 — 4.6 에서 세어 본다.

import * as users from "./store/users.js";
import * as comments from "./store/comments.js";
import type { Post, PostListRow } from "./store/posts.js";
import type { Comment } from "./store/comments.js";

// 유저를 응답에 실을 때의 모양. password 가 절대 새어 나가지 않게 필드를 고른다.
// 객체를 그대로 보내고 민감한 필드만 지우는 방식(delete user.password)은 쓰지 않는다 —
// 필드가 하나 늘 때마다 지우는 것을 잊게 된다. 넣을 것을 고르는 쪽이 안전하다.
export async function authorView(userId: string) {
  const user = await users.findById(userId);
  if (!user) return null;
  return { id: user.id, nickname: user.nickname };
}

export async function userView(userId: string) {
  const user = await users.findById(userId);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    createdAt: user.createdAt,
  };
}

export async function commentView(comment: Comment) {
  return {
    id: comment.id,
    body: comment.body,
    author: await authorView(comment.authorId),
    createdAt: comment.createdAt,
  };
}

// 목록 항목에는 body 를 넣지 않는다(02-api.md 2.4). 1만 건 목록에서 본문까지 실어 보내면
// 응답이 수 MB 가 된다. 상세에서만 준다.
//
// 7.7 전에는 이 함수가 글마다 작성자와 댓글 수를 따로 물어봐서 쿼리가 2 + N 이었다.
// 지금은 저장소가 한 쿼리로 들고 오고, 여기서는 모양만 고른다 — await 가 하나도 없다.
export function postListItemView(post: PostListRow) {
  return {
    id: post.id,
    title: post.title,
    author: post.author,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
  };
}

export async function postDetailView(
  post: Post,
  commentPage: { items: Comment[]; nextCursor: string | null; hasNext: boolean },
) {
  return {
    id: post.id,
    title: post.title,
    body: post.body,
    author: await authorView(post.authorId),
    commentCount: await comments.countByPostId(post.id),
    // 상세 화면을 한 번의 호출로 그리려고 댓글 첫 페이지를 같이 담는다(02-api.md 2.6).
    comments: {
      items: await Promise.all(commentPage.items.map(commentView)),
      pageInfo: { nextCursor: commentPage.nextCursor, hasNext: commentPage.hasNext },
    },
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}

// 목록 응답의 봉투. items 와 pageInfo 라는 이름은 02-api.md 에서 고정했고,
// 8.6 의 useInfiniteQuery 가 pageInfo.nextCursor 를 그대로 읽는다.
export function listView<T>(page: { items: T[]; nextCursor: string | null; hasNext: boolean }) {
  return { items: page.items, pageInfo: { nextCursor: page.nextCursor, hasNext: page.hasNext } };
}
