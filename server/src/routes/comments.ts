// 문서: docs/code/routes-comments.md · 커리큘럼 3.5 · 3.6 · 5.2
//
// 댓글 목록 · 작성 · 삭제. 엔드포인트 9·10·11번(docs/02-api.md 2.2).
// 라우터가 둘인 이유는 경로가 두 종류이기 때문이다 —
// 목록·작성은 글에 딸려 있고(/posts/:postId/comments), 삭제는 댓글 자체를 가리킨다(/comments/:id).

import { Router } from "express";
import * as posts from "../store/posts.js";
import * as comments from "../store/comments.js";
import { requireAuth } from "../middleware/currentUser.js";
import { validate, validBody, validParams, validQuery } from "../middleware/validate.js";
import {
  CreateCommentBody,
  IdParams,
  ListCommentsQuery,
  PostIdParams,
} from "../schemas/index.js";
import { commentNotFound, ForbiddenError, postNotFound } from "../errors.js";
import { commentView, listView } from "../views.js";

const DEFAULT_LIMIT = 20;

// mergeParams: true 가 없으면 req.params.postId 가 undefined 다.
// 마운트 경로(/posts/:postId/comments)의 파라미터는 기본적으로 자식 라우터에 내려오지 않는다.
export const postCommentsRouter = Router({ mergeParams: true });

// 9. GET /posts/:id/comments → 200
postCommentsRouter.get(
  "/",
  validate({ params: PostIdParams, query: ListCommentsQuery }),
  async (req, res) => {
    const { postId } = validParams<PostIdParams>(req);
    const { limit = DEFAULT_LIMIT, cursor } = validQuery<ListCommentsQuery>(req);

    // 글이 없으면 댓글 목록도 없다. 빈 배열이 아니라 404 다 — 02-api.md 표 9행.
    if (!(await posts.findById(postId))) throw postNotFound();

    const page = await comments.findManyByPostId({ postId, limit, cursor });
    const items = await Promise.all(page.items.map(commentView));
    res.json(listView({ ...page, items }));
  },
);

// 10. POST /posts/:id/comments → 201
postCommentsRouter.post(
  "/",
  requireAuth,
  validate({ params: PostIdParams, body: CreateCommentBody }),
  async (req, res) => {
    const { postId } = validParams<PostIdParams>(req);
    const { body } = validBody<CreateCommentBody>(req);

    if (!(await posts.findById(postId))) throw postNotFound();

    const comment = await comments.create({ postId, authorId: req.user!.id, body });

    // Location 을 붙이지 않는다. 댓글 단건을 GET 으로 가져오는 경로가 11개 안에 없다.
    res.status(201).json(await commentView(comment));
  },
);

// 11. DELETE /comments/:id → 204
export const commentsRouter = Router();

commentsRouter.delete("/:id", requireAuth, validate({ params: IdParams }), async (req, res) => {
  const { id } = validParams<IdParams>(req);

  const comment = await comments.findById(id);
  if (!comment) throw commentNotFound();

  // 댓글 작성자만 지운다. 글 작성자가 남의 댓글을 지우는 권한은 이번 범위에 없다
  // (docs/01-domain.md "안 만들 것" 4번 — 권한 등급은 소유자냐 아니냐 둘뿐이다).
  if (comment.authorId !== req.user!.id) {
    throw new ForbiddenError("내 댓글만 삭제할 수 있습니다.");
  }

  await comments.remove(comment.id);
  res.status(204).end();
});
