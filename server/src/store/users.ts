// 문서: docs/code/store-users.md · 커리큘럼 3.4 · 4.5
//
// 4단계에서 Map 을 Prisma 쿼리로 바꿨다. 함수 이름과 인자는 그대로다 —
// 3.4 에서 저장 방식과 무관하게 지어 둔 값어치가 여기서 나온다.

import { prisma } from "./prisma.js";

export type User = {
  id: string;
  email: string;
  // 6.1 에서 평문 password 가 argon2 해시로 바뀌며 이름도 함께 옮겼다.
  // 이름이 내용과 맞아야 한다 — 다음 사람이 평문인 줄 알고 비교하지 않게.
  passwordHash: string;
  nickname: string;
  createdAt: Date;
};

export function create(input: {
  email: string;
  passwordHash: string;
  nickname: string;
}): Promise<User> {
  // id 는 Prisma 가 만든다(@default(uuid())). 3단계의 crypto.randomUUID() 자리다.
  return prisma.user.create({ data: input });
}

export function findById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

export function findByEmail(email: string): Promise<User | null> {
  // 3단계에서는 Map 전체를 훑었다. 이제 users_email_key 유니크 인덱스를 타고 한 번에 찾는다.
  return prisma.user.findUnique({ where: { email } });
}
