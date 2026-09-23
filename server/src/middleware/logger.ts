// 문서: docs/code/middleware-logger.md · 커리큘럼 3.3 · 9.5
//
// 요청마다 id 를 붙이고, 응답이 끝날 때 한 줄을 남긴다.
//
// id 가 필요한 이유는 하나다 — 배포된 서버는 요청을 동시에 여러 개 처리한다.
// id 가 없으면 로그가 뒤섞여 어느 줄이 어느 요청의 것인지 알 수 없다.

import type { Request, Response, NextFunction } from "express";
import { logger } from "../logger.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: typeof logger;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // 플랫폼이나 프록시가 붙여 준 id 가 있으면 그것을 쓴다.
  // 그래야 로드 밸런서 로그와 우리 로그를 같은 id 로 이을 수 있다.
  req.id = req.header("x-request-id") ?? crypto.randomUUID();

  // 자식 로거를 만들어 두면 이 요청에서 찍는 모든 줄에 id 가 자동으로 붙는다.
  req.log = logger.child({ reqId: req.id });

  // 클라이언트도 id 를 알아야 "이 요청이 실패했다" 고 신고할 수 있다.
  res.setHeader("x-request-id", req.id);

  const startedAt = performance.now();

  // 응답이 끝나는 시점에 한 번 찍는다. 여기서 찍어야 상태 코드와 걸린 시간을 같이 쓸 수 있다.
  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Number((performance.now() - startedAt).toFixed(1)),
      },
      "request",
    );
  });

  // next() 를 부르지 않으면 요청이 여기서 멈춘다.
  next();
}
