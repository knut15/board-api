// 문서: docs/code/server.md · 커리큘럼 3.1 · 3.2 · 9.1 · 9.6
//
// 포트를 열고 듣는 일과, 종료 신호를 받아 정리하는 일을 맡는다.
// app 을 만드는 일은 app.ts 가 한다 — 나누면 포트를 열지 않고 app 만 테스트할 수 있다.

import { env } from "./env.js";
import { logger } from "./logger.js";
import { createApp } from "./app.js";
import { prisma } from "./store/prisma.js";

const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "listening");
});

// 9.6 — 배포 플랫폼은 서버를 내릴 때 SIGTERM 을 보내고 잠시 기다린다.
// 그 사이에 하는 일이 셋이다.
//   1. 새 요청을 받지 않는다 (server.close 가 리스너를 닫는다)
//   2. 진행 중인 요청을 끝낸다 (close 의 콜백이 그때 불린다)
//   3. DB 연결을 닫는다
//
// 이것을 하지 않으면 배포할 때마다 처리 중이던 요청이 끊긴다.
// 사용자 쪽에서는 "가끔 저장이 안 된다" 로 보인다.
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");

  // 기다려 주지 않는 플랫폼도 있다. 정해진 시간 안에 못 끝내면 그냥 나간다 —
  // 영영 안 닫히는 연결 하나 때문에 배포가 멈추는 것이 더 나쁘다.
  const forceExit = setTimeout(() => {
    logger.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (err) => {
    if (err) logger.error({ err }, "error while closing server");
    await prisma.$disconnect();
    logger.info("closed");
    process.exit(err ? 1 : 0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
