// 문서: docs/code/app.md · 커리큘럼 3.3, 3.5, 3.6
//
// 미들웨어와 라우터를 등록 순서대로 쌓는다. 이 파일의 줄 순서가 곧 요청이 지나가는 길이다.

import express from "express";
import cookieParser from "cookie-parser";
import { requestLogger } from "./middleware/logger.js";
import { currentUser } from "./middleware/currentUser.js";
import { authRouter, meRouter } from "./routes/auth.js";
import { postsRouter } from "./routes/posts.js";
import { postCommentsRouter, commentsRouter } from "./routes/comments.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { routeNotFound } from "./errors.js";

export function createApp() {
  const app = express();

  // 1. 로그 — 가장 먼저. 뒤에서 무슨 일이 나든 요청이 들어온 사실은 남는다.
  //    요청 id 를 여기서 붙이므로, 아래 어느 미들웨어에서 죽어도 그 id 로 로그를 이을 수 있다.
  app.use(requestLogger);

  // 2. 바디 파싱 — 이 줄을 지우면 모든 라우터에서 req.body 가 undefined 가 된다.
  app.use(express.json());

  // 3. 쿠키 파싱 — 6.7 의 리프레시 토큰이 httpOnly 쿠키로 온다.
  app.use(cookieParser());

  // 4. 요청자 식별 — Authorization: Bearer <JWT> 를 검증해 req.user 를 채운다(6.4).
  app.use(currentUser);

  // 4. 건강 검사 — 9.6 에서 배포 플랫폼의 헬스체크에 물린다.
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // 5. 라우터. 더 구체적인 경로를 먼저 등록한다.
  app.use("/auth", authRouter);
  app.use("/me", meRouter);
  app.use("/posts/:postId/comments", postCommentsRouter);
  app.use("/posts", postsRouter);
  app.use("/comments", commentsRouter);

  // 6. 어느 라우터에도 걸리지 않은 요청. 여기까지 왔다면 그런 경로가 없다.
  //    응답을 만들지 않고 던진다 — 4xx 바디를 만드는 곳은 아래 한 곳뿐이다(5.6).
  app.use(() => {
    throw routeNotFound();
  });

  // 7. 에러 핸들러. 등록 순서상 맨 끝이어야 앞의 모든 것이 여기로 모인다.
  //    Express 5 는 async 핸들러가 던진 것도 자동으로 여기로 넘긴다.
  app.use(errorHandler);

  return app;
}
