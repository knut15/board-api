// 문서: docs/code/logger.md · 커리큘럼 9.5
//
// JSON 로그. console.log 로는 배포 뒤에 아무것도 못 찾는다 —
// 플랫폼의 로그 검색은 줄 단위 문자열이 아니라 필드를 걸어 찾는다.

import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,

  // 비밀번호·토큰이 로그에 실리는 사고를 구조적으로 막는다.
  // 어느 핸들러가 무엇을 찍든 이 경로들은 [Redacted] 가 된다.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "body.password",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[Redacted]",
  },

  // 개발에서는 사람이 읽을 수 있게 꾸미고 싶어지는데, 그러려면 pino-pretty 가 더 필요하다.
  // 지금은 양쪽 다 JSON 으로 둔다 — 개발에서 보는 모양과 운영에서 보는 모양이 같은 편이
  // "로그에 이 필드가 없네" 를 일찍 알아차리게 한다.
});
