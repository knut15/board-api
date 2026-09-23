// 문서: docs/code/env.md · 커리큘럼 9.1
//
// 환경변수를 읽고 **형식까지** 검증한다. 하나라도 어긋나면 부팅에서 죽는다.
// 서버가 30분 돌다가 undefined 를 만나는 것보다 뜨지 않는 쪽이 낫다.
//
// 이 모듈을 import 하는 것만으로 검증이 돈다. 다른 모듈은 process.env 를 직접 읽지 않고
// 여기서 내보내는 env 를 쓴다 — 그러면 "누가 먼저 로드되는가" 를 걱정할 필요가 없다.
// ESM 은 import 를 먼저 평가하므로 순서가 저절로 맞는다.

import { existsSync } from "node:fs";
import { z } from "zod";

// 배포 환경에서는 플랫폼이 환경변수를 직접 주입한다. .env 파일이 없는 것이 정상이다.
if (existsSync(".env")) process.loadEnvFile(".env");

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.url("postgresql://… 형태의 주소여야 합니다."),

  // 짧은 키는 무차별 대입으로 뚫린다. 32자 미만을 막는다.
  // openssl rand -hex 32 로 만들면 64자다.
  JWT_SECRET: z.string("반드시 있어야 합니다.").min(32, "32자 이상이어야 합니다. openssl rand -hex 32"),

  // 쿼리 파라미터와 같은 이유로 coerce 를 조심한다 — 빈 문자열은 0 이 되는데
  // min(1) 이 그것을 걸러 낸다.
  PORT: z.coerce.number("숫자여야 합니다.").int().min(1).max(65535).default(4000),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // 8단계 구조에서는 브라우저가 Express 를 직접 부르지 않아 비워 둔다.
  // BFF 를 걷어내는 날 이 값이 필요해진다(8.1).
  CORS_ORIGIN: z.string().optional(),
});

const parsed = Env.safeParse(process.env);

if (!parsed.success) {
  // 무엇이 왜 잘못됐는지 한 줄씩 보여 준다. "invalid env" 한 줄만 찍으면
  // 배포 로그를 보는 사람이 어느 값을 고쳐야 하는지 모른다.
  console.error("환경변수가 올바르지 않습니다:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"} — ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
