// 문서: docs/code/routes-posts.md · 커리큘럼 3.5 · 3.6 · 5.2
//
// 글 목록 · 작성 · 상세 · 수정 · 삭제. 엔드포인트 4·5·6·7·8번(docs/02-api.md 2.2).
//
// 5단계 뒤로 이 파일에 남은 것은 세 가지뿐이다 — 저장소 호출, 소유권 판단, 성공 응답.
// 형식 검사와 에러 응답 만들기는 다른 파일로 갔다.

import { Router } from "express";
import * as posts from "../store/posts.js";
import * as comments from "../store/comments.js";
import { requireAuth } from "../middleware/currentUser.js";
import { validate, validBody, validParams, validQuery } from "../middleware/validate.js";
import {
  CreatePostBody,
  IdParams,
  ListPostsQuery,
  UpdatePostBody,
} from "../schemas/index.js";
import { ForbiddenError, postNotFound } from "../errors.js";
import { listView, postDetailView, postListItemView } from "../views.js";

export const postsRouter = Router();

const DEFAULT_LIMIT = 20;
const emptyCommentPage = { items: [], nextCursor: null, hasNext: false };

// 4. GET /posts → 200
postsRouter.get("/", validate({ query: ListPostsQuery }), async (req, res) => {
  const { limit = DEFAULT_LIMIT, cursor, sort, q, authorId } = validQuery<ListPostsQuery>(req);

  const page = await posts.findMany({ limit, cursor, sort, q, authorId });
  res.json(listView({ ...page, items: page.items.map(postListItemView) }));
});

// 5. POST /posts → 201
postsRouter.post("/", requireAuth, validate({ body: CreatePostBody }), async (req, res) => {
  const { title, body } = validBody<CreatePostBody>(req);
  const post = await posts.create({ authorId: req.user!.id, title, body });

  // GET /posts/:id 로 실제로 가져올 수 있는 경로이므로 Location 을 붙인다(02-api.md 2.3).
  const created = await postDetailView(post, emptyCommentPage);
  res.status(201).location(`/posts/${post.id}`).json(created);
});

// 6. GET /posts/:id → 200
postsRouter.get("/:id", validate({ params: IdParams }), async (req, res) => {
  const { id } = validParams<IdParams>(req);

  const post = await posts.findById(id);
  if (!post) throw postNotFound();

  // 상세 화면을 한 번의 호출로 그리려고 댓글 첫 페이지를 같이 담는다(02-api.md 2.6).
  const commentPage = await comments.findManyByPostId({ postId: post.id, limit: DEFAULT_LIMIT });
  res.json(await postDetailView(post, commentPage));
});

// 7. PATCH /posts/:id → 200
postsRouter.patch(
  "/:id",
  requireAuth,
  validate({ params: IdParams, body: UpdatePostBody }),
  async (req, res) => {
    const { id } = validParams<IdParams>(req);
    const patch = validBody<UpdatePostBody>(req);

    const post = await posts.findById(id);
    // 존재 검사가 권한 검사보다 먼저다(02-api.md 2.5). 없는 글에는 소유자가 없다.
    if (!post) throw postNotFound();
    if (post.authorId !== req.user!.id) throw new ForbiddenError("내 글만 수정할 수 있습니다.");

    const updated = await posts.update(post.id, patch);
    const commentPage = await comments.findManyByPostId({ postId: post.id, limit: DEFAULT_LIMIT });
    res.json(await postDetailView(updated, commentPage));
  },
);

// 8. DELETE /posts/:id → 204
postsRouter.delete("/:id", requireAuth, validate({ params: IdParams }), async (req, res) => {
  const { id } = validParams<IdParams>(req);

  const post = await posts.findById(id);
  // 같은 DELETE 를 두 번 보내면 두 번째는 여기로 와 404 가 된다. 정한 것이다(02-api.md 2.5).
  if (!post) throw postNotFound();
  if (post.authorId !== req.user!.id) throw new ForbiddenError("내 글만 삭제할 수 있습니다.");

  // 딸린 댓글은 DB 가 함께 지운다(comments.postId 의 ON DELETE CASCADE, 4.3).
  await posts.remove(post.id);

  // 204 는 바디가 없다. res.json({}) 을 쓰면 규약 위반이다.
  res.status(204).end();
});
