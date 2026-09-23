// 커리큘럼 4.7 — 트랜잭션이 무엇을 막는지 눈으로 본다.
//
// 실행:
//   pnpm exec tsx prisma/4.7-transaction.ts
//
// 앱 코드에는 $transaction 이 없다. 4.3 에서 ON DELETE CASCADE 를 고른 순간
// "글 삭제 + 댓글 정리" 가 한 문장이 되어 중간 상태가 사라졌기 때문이다.
// 그래도 트랜잭션이 무엇을 해 주는지는 알고 넘어가야 해서, 여기서 따로 확인한다.

import { prisma } from "../src/store/prisma.js";

const count = () =>
  Promise.all([prisma.user.count(), prisma.post.count()]).then(([u, p]) => `유저 ${u} · 글 ${p}`);

async function main() {
  const email = `tx-${Date.now()}@test.com`;
  console.log("시작 상태:", await count());

  // 1. 트랜잭션 없이 두 번 쓰다가 중간에 실패하면
  const user = await prisma.user.create({
    data: { email, password: "x", nickname: "트랜잭션" },
  });
  try {
    // 없는 글에 댓글을 달려고 한다 → 외래키 위반(P2003)
    await prisma.comment.create({
      data: { postId: "00000000-0000-0000-0000-000000000000", authorId: user.id, body: "실패할 댓글" },
    });
  } catch {
    console.log("트랜잭션 없이:  두 번째 쓰기가 실패했다.", await count(), "← 유저는 남았다");
  }
  await prisma.user.delete({ where: { id: user.id } });

  // 2. 같은 일을 트랜잭션으로 묶으면
  try {
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { email, password: "x", nickname: "트랜잭션" },
      });
      await tx.comment.create({
        data: { postId: "00000000-0000-0000-0000-000000000000", authorId: u.id, body: "실패할 댓글" },
      });
    });
  } catch {
    console.log("트랜잭션 안에서: 두 번째 쓰기가 실패했다.", await count(), "← 유저도 되돌아갔다");
  }

  await prisma.$disconnect();
}

main();
