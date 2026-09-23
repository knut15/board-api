# 6문서 — PostgreSQL 연결 (커리큘럼 4단계)

출처: 아티팩트 "게시판 API 서버, 설계부터 배포까지" 4단계
<https://claude.ai/artifact/WffCicExjmUU5R7yfvba1H>

데이터를 프로세스 밖에 둔다. **SQL 을 손으로 한 번 쳐 본 다음에** Prisma 를 얹었다 —
순서를 바꾸면 ORM 이 무엇을 대신해 주는지 끝까지 모른다.

문서 번호(06)는 읽는 순서이고 커리큘럼 단계(4)와 다르다. 04·05 는 클라이언트 쪽 문서다.

## 4.1 DB 를 컨테이너로 띄운다

노트북에 Postgres 를 설치하지 않는다. `server/compose.yaml` 한 장이 전부다.

```bash
pnpm --filter board-api-server db:up     # docker-compose up -d
pnpm --filter board-api-server db:psql   # 컨테이너 안에서 psql 접속
pnpm --filter board-api-server db:down   # 멈춘다 (데이터는 볼륨에 남는다)
pnpm --filter board-api-server db:nuke   # 볼륨까지 지운다 (데이터가 사라진다)
```

이 환경에서는 컨테이너 런타임으로 **colima** 를 쓴다(Docker Desktop 이 없다).
`colima start` 로 VM 을 먼저 띄워야 `docker` 명령이 응답한다. `docker compose` 하위 명령은
없고 `docker-compose` 실행 파일이 따로 있어서 스크립트가 그쪽을 부른다.

띄운 것: **PostgreSQL 16.15** (`postgres:16-alpine`).

## 4.2 SQL 을 먼저 손으로

`server/prisma/4.2-sql-practice.sql` 에 `CREATE TABLE` · `INSERT` · `JOIN` · `GROUP BY` 를
직접 썼다. 연습용 스키마(`practice`)에 만들고 끝에 통째로 지우므로 마이그레이션과 섞이지 않는다.

```bash
PGPASSWORD=board psql -h localhost -U board -d board -f prisma/4.2-sql-practice.sql
```

여기서 확인한 것 두 가지가 4.3 의 결정 근거가 된다.

| 실험 | 결과 |
|---|---|
| 댓글 2건 달린 글을 지운다 | 댓글 2 → 0. `ON DELETE CASCADE` 가 걷어 간다 |
| 글이 남은 유저를 지운다 | 막힌다. `ON DELETE RESTRICT` 가 참조를 지킨다 |

`GROUP BY` 로 쓴 글별 댓글 수가 곧 목록 응답의 `commentCount` 다.
그 한 문장을 Prisma 가 어떻게 바꿔 놓는지는 4.6 에서 본다.

## 4.3 삭제 정책 — 정답이 아니라 선택이다

| 관계 | 고른 것 | 이유 |
|---|---|---|
| `comments.postId` → `posts.id` | **CASCADE** | 글이 없어진 댓글은 읽을 방법이 없다. 남겨 둘 이유가 없다 |
| `posts.authorId` → `users.id` | **RESTRICT** | 글쓴이를 지우는 엔드포인트가 없다. 고아 글이 생기는 쪽이 더 나쁘다 |
| `comments.authorId` → `users.id` | **RESTRICT** | 같은 이유 |

CASCADE 를 고른 순간 **4.7 의 트랜잭션 자리가 사라졌다.** 3단계에서는 댓글 Map 을 비우고
글 Map 을 비우는 두 줄 사이에 중간 상태가 있었는데, 이제 `DELETE FROM posts` 한 문장이
원자적으로 끝난다. 없어진 이유를 아는 것이 트랜잭션을 한 번 써 보는 것보다 값지다.

## 4.4 Prisma 붙이기

**버전을 골라야 했다.** `pnpm add prisma` 가 기본으로 집는 `latest` 태그가 `8.0.0-rc.15`
(릴리스 후보)를 가리켰다. 학습 프로젝트에 RC 를 쓸 이유가 없고 `@prisma/client` 와도
짝이 맞지 않아 **7.10.0 으로 고정**했다.

Prisma 7 에서 바뀐 것 셋을 겪었다.

| 6 까지 | 7 부터 | 이 레포에서 |
|---|---|---|
| `schema.prisma` 안에 `url = env("DATABASE_URL")` | 스키마에 `url` 을 둘 수 없다 | `server/prisma.config.ts` 로 옮겼다 |
| CLI 가 `.env` 를 알아서 읽었다 | 읽지 않는다 | Node 22+ 의 `process.loadEnvFile()` 을 썼다 (dotenv 를 설치하지 않았다) |
| `new PrismaClient()` 가 직접 붙었다 | 드라이버 어댑터가 필요하다 | `@prisma/adapter-pg` 를 통해 붙는다 |

### 생성된 SQL 과 손으로 쓴 SQL 의 차이

`prisma migrate dev --name init` 이 만든 `migration.sql` 을 4.2 의 파일과 나란히 놓으면
Prisma 가 어디까지 대신해 주는지가 보인다.

| 손으로 쓴 것 | Prisma 가 만든 것 | 뜻 |
|---|---|---|
| `id uuid DEFAULT gen_random_uuid()` | `"id" UUID NOT NULL` (기본값 없음) | **uuid 를 DB 가 아니라 클라이언트가 만든다.** `@default(uuid())` 는 Prisma 쪽 기본값이다 |
| `"updatedAt" DEFAULT now()` | `"updatedAt" TIMESTAMPTZ(3) NOT NULL` | `@updatedAt` 은 쓸 때마다 Prisma 가 값을 넣는다 |
| `REFERENCES users(id) ON DELETE RESTRICT` | 같은 문장 + `ON UPDATE CASCADE` | Prisma 는 갱신 정책을 함께 건다 |
| `UNIQUE` 를 컬럼에 붙임 | `CREATE UNIQUE INDEX "users_email_key"` | 제약을 인덱스로 따로 만든다 |

### 마이그레이션 이력 2개

```
prisma/migrations/
  20260922050850_init/                    테이블 3개 · FK 3개 · 유니크 인덱스 1개
  20260922050906_add_comment_post_index/  CREATE INDEX "comments_postId_idx"
```

두 번째가 필요한 이유 — **PostgreSQL 은 외래키에 인덱스를 자동으로 만들지 않는다.**
제약과 인덱스는 다른 것이다. 댓글 목록은 항상 `WHERE "postId" = $1` 로 거르므로
인덱스가 없으면 댓글이 쌓일수록 전체를 훑는다.

## 4.5 저장소만 교체 — 그런데 라우터도 바뀌었다

커리큘럼은 "라우터와 상태 코드는 한 줄도 건드리지 않는다" 고 한다. **지키지 못했다.**

| 파일 | 바뀌었나 |
|---|---|
| `src/routes/auth.ts` | 바뀜 |
| `src/routes/comments.ts` | 바뀜 |
| `src/routes/posts.ts` | 바뀜 |
| `src/views.ts` | 바뀜 |
| `src/respond.ts` | 그대로 |

이유는 하나다. **3단계 저장소를 동기 함수로 만들었다.** DB 는 원격이라 조회가 기다림이 되고,
`posts.findById(id)` 가 `await posts.findById(id)` 가 되면서 그것을 부르는 핸들러가 전부
`async` 가 됐다. 이름을 잘 지은 것만으로는 부족했다 — **모양도 맞춰 두었어야 했다.**

교훈: 저장소가 언젠가 원격이 될 것을 안다면 경계를 처음부터 비동기로 둔다.
`Map` 을 쓰더라도 `async findById()` 로 감싸 두었으면 이번에 라우터가 정말 한 줄도 안 바뀌었다.

바뀐 내용의 성격은 확인해 둘 만하다. **추가된 것은 `async`/`await` 뿐이고 상태 코드와 분기는 그대로다.**
현재 라우터의 실패 응답 분포는 `400` 9 · `401` 1 · `403` 3 · `404` 6 · `409` 1 · `422` 4 로
`02-api.md` 2.2 표와 일치한다.

## 4.6 관계 조회와 N+1

`PRISMA_LOG=query` 로 서버를 띄우면 쿼리가 그대로 찍힌다. 목록을 한 번 부르고 세었다.

| 목록에 담긴 글 | 쿼리 수 | 내역 |
|---|---|---|
| 1건 | 3 | `posts` 1 + `users` 1 + `COUNT` 1 |
| 5건 | 7 | `posts` 1 + `users` 1 + `COUNT` 5 |
| 10건 | 12 | `posts` 1 + `users` 1 + `COUNT` 10 |
| 20건 | 22 | `posts` 1 + `users` 1 + `COUNT` 20 |

**2 + N** 이다. 여기서 눈여겨볼 것이 두 가지다.

**작성자 조회는 이미 묶였다.** 코드는 글마다 `users.findById(post.authorId)` 를 부르는데
로그에는 한 줄만 찍힌다.

```sql
SELECT ... FROM "public"."users" WHERE "public"."users"."id" IN ($1,$2,$3,$4,$5)
```

Prisma 가 같은 틱에 들어온 `findUnique` 를 모아 `IN` 하나로 바꾼다. 손으로 아무것도 하지 않았다.

**댓글 수는 묶이지 않았다.** `COUNT` 가 글 수만큼 나간다. 이것이 남은 N+1 이고,
7.7 에서 `_count` 로 걷어내며 같은 방법으로 다시 센다. 그때 이 표의 숫자와 비교한다.

## 4.7 트랜잭션

앱 코드에는 `$transaction` 이 없다. 4.3 에서 CASCADE 를 고르며 필요가 사라졌다.
그래도 무엇을 막아 주는지는 보고 넘어간다 — `server/prisma/4.7-transaction.ts`.

```bash
pnpm exec tsx prisma/4.7-transaction.ts
```

유저를 만들고, 이어서 없는 글에 댓글을 달아 외래키 위반을 일으킨다.

```
시작 상태:      유저 4 · 글 21
트랜잭션 없이:  두 번째 쓰기가 실패했다. 유저 5 · 글 21 ← 유저는 남았다
트랜잭션 안에서: 두 번째 쓰기가 실패했다. 유저 4 · 글 21 ← 유저도 되돌아갔다
```

트랜잭션이 하는 일이 이 두 줄의 차이다. 실패한 절반이 남지 않는다.

## 이 단계의 통과 조건

- [x] 서버를 재시작해도 데이터가 남는다. 3단계의 호출 컬렉션이 그대로 통과한다
- [x] 댓글이 달린 글을 지웠을 때 4.3 에서 정한 대로 동작한다
- [x] `prisma/migrations` 에 이력이 2개 쌓였고, 각 SQL 을 읽고 무슨 문장인지 말할 수 있다
- [x] 목록 1회 호출에 쿼리가 몇 번 나가는지 숫자로 안다

### 검증 기록 (2026-09-22)

| 무엇 | 어떻게 | 결과 |
|---|---|---|
| 회귀 검사 | 3단계에 쓴 36가지를 DB 위에서 재실행 | **36 통과 · 0 실패** |
| 영속성 | 글 1건 + 댓글 2건을 만들고 서버 종료·재시작 | 목록 1건 유지, 그 글 조회 `200` |
| CASCADE | 댓글 2건 달린 글 삭제 후 `comments` 조회 | 2 → 0 |
| RESTRICT | 글이 1건 남은 유저를 `DELETE` | DB 가 거부: `violates foreign key constraint "posts_authorId_fkey"` |
| 쿼리 수 | `PRISMA_LOG=query` 로 목록 1회 호출 | 위 표 (2 + N) |
| 트랜잭션 | `4.7-transaction.ts` | 롤백 시 유저 수가 되돌아감 |
| 타입 | `pnpm --filter board-api-server typecheck` | 오류 0 |

## 다음 단계

5단계는 검증과 에러 처리다. 핸들러 안의 `if` 문을 zod 스키마와 미들웨어 하나로 옮기고,
`fail()` 직접 호출을 `throw` 로 바꿔 에러 핸들러 한 곳이 형태를 만들게 한다.
`P2002`(유니크 충돌) → `409`, `P2025`(레코드 없음) → `404` 번역도 그때 한곳으로 모은다 —
지금은 `store/posts.ts` 와 `store/comments.ts` 가 각자 `P2025` 를 잡고 있다.
