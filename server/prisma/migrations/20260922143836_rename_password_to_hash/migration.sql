-- 커리큘럼 6.1 — 컬럼 이름을 내용에 맞춘다.
--
-- Prisma 가 자동으로 만들면 DROP COLUMN "password" + ADD COLUMN "passwordHash" 가 되어
-- 들어 있던 값이 사라진다. 이름만 바꾸는 것이므로 RENAME 한 문장이면 되고,
-- 그러면 기존 행도 그대로 남는다. 마이그레이션 SQL 을 읽어야 하는 이유가 이것이다.
--
-- 다만 이 시점의 값은 아직 평문이다. 평문을 해시로 바꾸는 것은 SQL 이 할 수 없다 —
-- argon2 는 DB 안에 없다. 이 프로젝트에서는 학습용 데이터라 계정을 다시 만든다.
-- 실제 서비스라면 "다음 로그인 때 해시로 교체" 같은 이행 기간을 둔다.
ALTER TABLE "users" RENAME COLUMN "password" TO "passwordHash";
