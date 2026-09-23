# server/src/store/comments.ts

> 커리큘럼 3.4 · 4.5 · 4.6 · 짝: `server/src/store/comments.ts`

## 무엇을 하는 파일인가

댓글을 넣고 꺼내는 저장소다. `posts.ts` 와 모양이 거의 같지만 댓글은 언제나 어떤 글에 딸려 있어서
조회 함수가 `postId` 를 받는다. 3단계와 크게 다른 것이 하나 있다 — **글과 댓글의 연결을 이제 DB 가
지켜 준다.** 3단계에서는 `comment.postId` 라는 필드 하나가 전부였고 아무것도 그것을 보증하지
않았다. 내보내는 함수는 `create` / `findById` / `findManyByPostId` / `countByPostId` / `remove`
다섯이고, 3단계에 있던 `removeByPostId` 는 빠졌다.

## 코드를 따라 읽기

### 댓글은 오래된 것부터 준다

`orderBy` 가 `[{ createdAt: "asc" }, { id: "asc" }]` 다. `posts.ts` 는 `desc` 인데 여기는 `asc` 인
이유는 읽는 순서가 다르기 때문이다. 글 목록에서는 방금 올라온 것이 먼저 보여야 하지만, 댓글은 첫
댓글부터 순서대로 읽어야 대화가 이어진다. 세 번째 댓글이 두 번째에 답한 것이라면 최신순으로
뒤집었을 때 대답이 질문보다 먼저 나온다. 방향이 바뀌었으니 동점을 가르는 `id` 도 같이 `asc` 다.
커서로 자르는 부분(`take: limit + 1`, `cursor` + `skip: 1`)은 `posts.ts` 와 똑같다.

### `countByPostId` 는 이제 `COUNT` 쿼리이고, 글마다 한 번씩 나간다

몸통은 `prisma.comment.count({ where: { postId } })` 한 줄이다. 3단계에서는 댓글 `Map` 전체를 훑는
`for` 문이었다. 지금은 `SELECT COUNT(*) FROM comments WHERE "postId" = $1` 이 나가고
`comments_postId_idx` 인덱스를 탄다. 한 번의 비용은 크게 줄었다.
**줄지 않은 것은 부르는 횟수다.** `views.ts` 의 `postListItemView` 가 글 하나마다 이것을 부르므로
목록에 글이 20건이면 `COUNT` 가 20번 나간다. 쿼리 로그를 켜고 실제로 세면 이렇다.

| 목록의 글 수 | 나간 쿼리 수 | 내역 |
|---|---|---|
| 1 | 3 | `posts` SELECT 1 + `users` SELECT 1 + `COUNT` 1 |
| 5 | 7 | `posts` 1 + `users` 1 + `COUNT` 5 |
| 10 | 12 | `posts` 1 + `users` 1 + `COUNT` 10 |
| 20 | 22 | `posts` 1 + `users` 1 + `COUNT` 20 |

**2 + N** 이다. 눈에 띄는 것은 작성자 조회가 N 이 아니라 1이라는 점이다. `views.ts` 는 글마다
`users.findById` 를 부르는데 **Prisma 가 그 `findUnique` 들을 `WHERE id IN ($1,…,$N)` 하나로
묶었다**(findUnique 배칭). 묶이지 않은 것은 `COUNT` 뿐이고 남은 N+1 은 이 함수 하나다 —
`count` 는 집계라 여러 건을 한 번에 묶는 자동 처리가 없다. 7.7 에서 목록 질의에 `_count` 를 붙여
걷어내고, 같은 방법으로 다시 세면 글 수와 무관한 고정된 숫자가 나와야 한다. 지금 이대로 둔 것은
고칠 때 무엇이 사라지는지 보이게 하기 위해서다.

### `removeByPostId` 가 사라졌다

3단계에는 글 하나에 딸린 댓글을 전부 지우는 함수가 있었고 `routes/posts.ts` 의 삭제 핸들러가 글을
지우기 전에 그것을 불렀다. 지금은 함수도 호출도 없다.

```sql
ALTER TABLE "comments" ADD CONSTRAINT "comments_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

`ON DELETE CASCADE` 를 고르면서 **애플리케이션이 할 일이 없어졌다.** 글 삭제는 `DELETE FROM posts`
한 문장이 되고 딸린 댓글은 DB 가 같은 문장 안에서 걷어 간다. 댓글 2건이 달린 글을 지워 보니 그
글의 댓글이 2 → 0 이 됐다. 없어진 것은 함수만이 아니다. 3단계에는 두 `Map` 을 차례로 지우는 사이에
프로세스가 죽으면 글은 없는데 댓글이 남는 중간 상태가 있었고, 지울 글이 이미 없으니 다시 지울
방법도 없었다. 삭제가 한 문장이 되면서 그 상태가 생길 자리가 사라졌다.

### `@@index([postId])` 를 두 번째 마이그레이션으로 따로 넣었다

```sql
-- 20260922050906_add_comment_post_index
CREATE INDEX "comments_postId_idx" ON "comments"("postId");
```

첫 마이그레이션에 이미 `comments_postId_fkey` 외래키가 있는데 인덱스를 또 만든다.
**PostgreSQL 은 외래키에 인덱스를 자동으로 만들지 않기 때문이다** — 제약과 인덱스는 다른 것이다.
제약은 "가리키는 글이 실제로 있는가" 를 판정하고, 인덱스는 "이 `postId` 의 행을 빨리 찾는" 구조다.
참조되는 쪽(`posts.id`)에는 PK 인덱스가 있지만 참조하는 쪽(`comments.postId`)에는 아무것도 없다.
없으면 댓글 목록도 `countByPostId` 도 전부 `WHERE postId = …` 이므로 댓글이 쌓일수록 그 두 가지가
`comments` 전체를 훑는다. 위 표의 `COUNT` N 건이 각각 전체 훑기가 되는 셈이다. 마이그레이션을
나눈 것은 의도한 것이다 — 같은 파일에 넣으면 "테이블 만들 때 딸려 온 것" 으로 보여 왜 필요한지
묻지 않게 된다. 따로 떼면 **인덱스를 붙인 커밋이 이 이유 하나로 남는다.**

## 왜 이렇게 했는가

1. **CASCADE 대 애플리케이션 삭제.** 손으로 지우면 무엇이 지워지는지 코드에 보인다. 대신 지우는
   경로가 늘 때마다 같은 코드를 또 써야 하고 한 군데를 잊으면 고아 댓글이 생긴다. 여기서는 규칙이
   단순해서 — 글이 없으면 그 댓글은 보이지 않는다 — DB 에 맡기는 쪽이 어긋날 자리가 적다.
2. **`authorId` 는 `Restrict` 로 뒀다.** 같은 테이블의 두 외래키가 서로 다르다. 글이 지워지면 댓글도 의미를 잃지만, 사람이 지워진다고 그 사람의 댓글이 남의 글에서 사라질 이유는 없다.
3. **`countByPostId` 를 지금 최적화하지 않는다.** `_count` 로 합치면 당장 줄일 수 있지만 그러면 4.6 에서 셀 것이 없어진다. 느린 코드를 남겨 두는 것이 실습 재료다.

## 직접 해 볼 것

1. `PRISMA_LOG=query pnpm dev` 로 띄우고 `GET /posts?limit=5` 와 `?limit=10` 을 한 번씩 보낸다.
   찍힌 쿼리가 7회·12회인지, `users` 쿼리가 `IN (…)` 한 줄인지 확인한다.
2. `pnpm db:psql` 에서 `EXPLAIN SELECT count(*) FROM comments WHERE "postId" = '…';` 를 실행하고,
   `DROP INDEX comments_postId_idx;` 뒤 다시 실행해 계획 차이를 본 다음 `pnpm migrate` 로 되돌린다.
3. 댓글이 달린 글을 지우고 `SELECT count(*) FROM comments WHERE "postId" = '지운 글 id';` 가 `0` 인 것을 본다. 애플리케이션 코드는 그 일에 관여하지 않았다.
4. `onDelete: Cascade` 를 `Restrict` 로 바꿔 마이그레이션한 뒤 댓글이 달린 글을 지워 본다. DB 가
   막는 것을 확인하고 되돌린다 — `removeByPostId` 가 무엇을 대신하고 있었는지 여기서 보인다.

## 3단계에서 무엇이 바뀌었나

| | 3단계 | 4단계 |
|---|---|---|
| 저장 | 모듈 안의 `Map<string, Comment>` | `comments` 테이블 |
| 글별 조회 | `filter(c => c.postId === postId)` | `where: { postId }` + `comments_postId_idx` |
| `countByPostId` | `Map` 전체를 훑는 `for` 문 | `COUNT` 쿼리. 목록 한 번에 N 번 |
| `removeByPostId` | 글 삭제 전에 손으로 호출 | **없다.** `ON DELETE CASCADE` 가 맡는다 |
| 글과의 연결 | 필드 하나. 아무것도 보증하지 않음 | 외래키 제약. 없는 글을 가리키는 댓글이 못 생긴다 |

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 5.7 | `remove` 의 `P2025` 검사가 에러 핸들러로 옮겨 간다. `posts.ts` 와 같은 처리다 |
| 7.7 | `countByPostId` 호출이 `_count` 한 번으로 합쳐진다. 위 표의 `COUNT` N 건이 0이 된다 |
