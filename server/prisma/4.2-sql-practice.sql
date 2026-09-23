-- 커리큘럼 4.2 — ORM 이 대신 만들어 줄 문장을 먼저 손으로 쓴다.
-- 4.4 에서 Prisma 가 만든 SQL 과 이 파일을 비교한다.
--
-- 실행:
--   PGPASSWORD=board psql -h localhost -U board -d board -f prisma/4.2-sql-practice.sql
--
-- 연습용 스키마에 만든다. 마지막에 통째로 지우므로 Prisma 마이그레이션과 섞이지 않는다.

DROP SCHEMA IF EXISTS practice CASCADE;
CREATE SCHEMA practice;
SET search_path TO practice;

-- 1. 테이블 — docs/01-domain.md 의 필드 표를 SQL 로 옮긴 것
CREATE TABLE users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  password   text NOT NULL,
  nickname   text NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "authorId"  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title       text NOT NULL,
  body        text NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "postId"    uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  "authorId"  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body        text NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT now()
);

-- 2. 넣기
INSERT INTO users (email, password, nickname) VALUES
  ('kim@example.com', 'password123', 'kim'),
  ('lee@example.com', 'password123', '이수진');

INSERT INTO posts ("authorId", title, body)
SELECT id, '첫 글', '본문' FROM users WHERE email = 'kim@example.com';
INSERT INTO posts ("authorId", title, body)
SELECT id, '두 번째 글', '본문' FROM users WHERE email = 'lee@example.com';

INSERT INTO comments ("postId", "authorId", body)
SELECT p.id, u.id, '댓글 하나'
FROM posts p, users u
WHERE p.title = '첫 글' AND u.email = 'lee@example.com';
INSERT INTO comments ("postId", "authorId", body)
SELECT p.id, u.id, '댓글 둘'
FROM posts p, users u
WHERE p.title = '첫 글' AND u.email = 'kim@example.com';

-- 3. JOIN — 목록 응답에 필요한 것(글 + 작성자 닉네임)
\echo '--- JOIN: 글과 작성자'
SELECT p.title, u.nickname AS author
FROM posts p
JOIN users u ON u.id = p."authorId"
ORDER BY p."createdAt" DESC;

-- 4. GROUP BY — 목록의 commentCount. 이것이 7.7 에서 Prisma _count 가 대신할 일이다.
\echo '--- GROUP BY: 글별 댓글 수 (LEFT JOIN 이라 0건도 나온다)'
SELECT p.title, count(c.id) AS "commentCount"
FROM posts p
LEFT JOIN comments c ON c."postId" = p.id
GROUP BY p.id, p.title
ORDER BY p."createdAt" DESC;

-- 5. ON DELETE 확인 — 글을 지우면 댓글이 따라 지워지는가
\echo '--- 삭제 전 댓글 수'
SELECT count(*) FROM comments;
DELETE FROM posts WHERE title = '첫 글';
\echo '--- 글을 지운 뒤 댓글 수 (CASCADE 가 걷어 간다)'
SELECT count(*) FROM comments;

-- 6. RESTRICT 확인 — 글이 남아 있는 사람은 지울 수 없다
\echo '--- 글이 있는 유저 삭제 시도 (막혀야 정상)'
DO $$
BEGIN
  DELETE FROM users WHERE email = 'lee@example.com';
  RAISE NOTICE '지워졌다 — RESTRICT 가 안 걸렸다';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '막혔다 — ON DELETE RESTRICT 가 동작한다';
END $$;

DROP SCHEMA practice CASCADE;
