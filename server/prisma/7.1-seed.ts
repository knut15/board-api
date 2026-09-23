// 커리큘럼 7.1 — 느려 봐야 배우는 단계라 데이터부터 넣는다.
//
//   pnpm exec tsx prisma/7.1-seed.ts
//
// 글 1만 건, 댓글 5만 건. createMany 로 한 번에 넣는다 —
// create 를 5만 번 부르면 왕복이 5만 번이다.

import "../src/env.js";
import { prisma } from "../src/store/prisma.js";
import { hashPassword } from "../src/auth/password.js";

const POSTS = 10_000;
const COMMENTS = 50_000;
const AUTHORS = 20;

const TOPICS = [
  "미들웨어 순서", "상태 코드", "커서 페이지네이션", "트랜잭션", "인덱스",
  "N+1", "JWT", "argon2", "마이그레이션", "외래키", "검증", "에러 처리",
];
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]!;

async function main() {
  const t0 = performance.now();

  // 1. 작성자. 해시 한 번만 만들어 돌려 쓴다 — argon2 는 일부러 느려서
  //    20번 부르면 그것만 1초가 넘는다. 시드는 로그인할 일이 없다.
  const passwordHash = await hashPassword("password123");
  const existing = await prisma.user.findMany({ select: { id: true } });
  const need = Math.max(0, AUTHORS - existing.length);
  if (need > 0) {
    await prisma.user.createMany({
      data: Array.from({ length: need }, (_, i) => ({
        email: `seed${i}-${Date.now()}@example.com`,
        passwordHash,
        nickname: `시드${i}`,
      })),
    });
  }
  const authors = (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id);

  // 2. 글. createdAt 을 과거로 흩어 둬야 정렬과 커서가 의미를 갖는다.
  const now = Date.now();
  const posts = Array.from({ length: POSTS }, (_, i) => ({
    authorId: pick(authors),
    title: `${pick(TOPICS)} 이야기 ${i + 1}`,
    body: `본문 ${i + 1}.\n\n${pick(TOPICS)} 에 대해 적는다.`,
    // 1분 간격으로 과거로 흩는다. 같은 밀리초가 겹치지 않는다.
    createdAt: new Date(now - i * 60_000),
    updatedAt: new Date(now - i * 60_000),
  }));

  // createMany 는 한 번에 너무 많이 보내면 파라미터 상한에 걸린다. 나눠 보낸다.
  for (let i = 0; i < posts.length; i += 1000) {
    await prisma.post.createMany({ data: posts.slice(i, i + 1000) });
  }
  const postIds = (await prisma.post.findMany({ select: { id: true } })).map((p) => p.id);

  // 3. 댓글. 글마다 고르게 흩지 않는다 — 실제 게시판이 그렇듯 몇 글에 몰리게 둔다.
  const comments = Array.from({ length: COMMENTS }, (_, i) => ({
    postId: pick(postIds),
    authorId: pick(authors),
    body: `댓글 ${i + 1}`,
    createdAt: new Date(now - Math.floor(Math.random() * POSTS) * 60_000),
  }));
  for (let i = 0; i < comments.length; i += 2000) {
    await prisma.comment.createMany({ data: comments.slice(i, i + 2000) });
  }

  const [u, p, c] = await Promise.all([prisma.user.count(), prisma.post.count(), prisma.comment.count()]);
  console.log(`유저 ${u} · 글 ${p} · 댓글 ${c} — ${((performance.now() - t0) / 1000).toFixed(1)}초`);
  await prisma.$disconnect();
}

main();
