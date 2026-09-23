// 문서: docs/code/store-prisma.md · 커리큘럼 4.4 · 4.6
//
// PrismaClient 하나를 만들어 저장소 세 파일이 나눠 쓴다.
// 파일마다 new PrismaClient() 를 하면 연결 풀이 그 수만큼 생기고,
// tsx watch 가 파일을 다시 읽을 때마다 연결이 쌓인다.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../env.js";

// 읽고 검증하는 일은 env.ts 가 한다. 여기서는 값만 받아 쓴다(9.1).
const url = env.DATABASE_URL;

// Prisma 7 은 클라이언트가 직접 DB 에 붙지 않고 드라이버 어댑터를 거친다.
// 여기서는 node-postgres(pg) 어댑터를 쓴다.
const adapter = new PrismaPg({ connectionString: url });

export const prisma = new PrismaClient({
  adapter,
  // 커리큘럼 4.6 — 목록 한 번에 쿼리가 몇 번 나가는지 눈으로 세기 위해 켠다.
  // 7.7 에서 이 숫자가 줄어드는 것을 같은 방법으로 확인한다.
  log: process.env.PRISMA_LOG === "query" ? ["query"] : [],
});
