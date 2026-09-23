// 커리큘럼 4.4 — Prisma 7 의 설정 파일.
//
// 6 버전까지는 schema.prisma 안에 url = env("DATABASE_URL") 을 적었다.
// 7 부터는 연결 주소가 여기로 나왔다. 스키마는 구조만 말하고, 접속은 설정이 맡는다.
//
// 7 은 .env 를 알아서 읽어 주지도 않는다. dotenv 를 설치하는 대신 Node 22 부터 들어온
// process.loadEnvFile() 을 쓴다 — 의존성이 하나도 늘지 않는다.
// 파일이 있을 때만 읽는다. 배포 환경에는 없는 것이 정상이다.

import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// 배포 환경에는 .env 파일이 없다. 플랫폼이 환경변수를 직접 주입한다.
// 무조건 읽으면 도커 빌드와 릴리스 커맨드가 ENOENT 로 죽는다 — 실제로 겪었다.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
