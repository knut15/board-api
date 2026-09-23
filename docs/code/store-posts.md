# server/src/store/posts.ts

> 커리큘럼 3.4 · 4.5 · 7.3 · 짝: `server/src/store/posts.ts`

## 무엇을 하는 파일인가

글을 넣고 꺼내는 저장소다. 밖에서 보면 `create` / `findById` / `findMany` / `update` / `remove`
다섯 함수이고 그 안이 이제 `posts` 테이블이다. 7단계에서 `findMany` 하나만 인자(`sort`·`q`·
`authorId`)와 반환 타입(`PostListRow` = 글 + `author` + `commentCount`)이 넓어졌다.

## 코드를 따라 읽기

### 정렬·거르기·자르기를 모두 DB 가 한다

```ts
const [field, dir] = sort.split(":") as ["createdAt", "asc" | "desc"];

const rows = await prisma.post.findMany({
  where: {
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(authorId ? { authorId } : {}),
  },
  orderBy: [{ [field]: dir }, { id: dir }],
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  include: {
    author: { select: { id: true, nickname: true } },
    _count: { select: { comments: true } },
  },
});
```

3단계의 `findMany` 는 호출마다 `Map` 을 전부 펼쳐 `sort` 했다 — 20건을 주려고 1만 건을 정렬했다. 지금은
`ORDER BY … LIMIT` 이 하고, 맞는 인덱스가 있으면 앞에서 필요한 만큼만 읽고 멈춘다. `sort` 는 `z.enum` 을
통과한 값이라 다시 검사하지 않는다 — **값의 출처가 허용 목록**이라는 것이 요점이다(7.4).

### `orderBy` 가 두 개인 이유

같은 밀리초에 두 건이 만들어지면 `createdAt` 이 동점이 되고 순서가 호출마다 달라질 수 있다. 순서가
흔들리면 커서 페이지네이션이 깨진다 — 같은 글이 두 번 오거나 빠진다. 그래서 두 번째 키로 PK 인 `id` 를
두고 방향도 첫 키에 맞춘다. `comments.ts` 는 언제나 `[asc, asc]` 다.

**`cursor` 와 `skip: 1`.** Prisma 의 `cursor` 는 "이 행부터 읽어라" 는 뜻이라 **그대로 두면 커서가 가리키는 행 자신이 결과에 다시
들어온다.** `skip: 1` 이 그 한 건을 건너뛴다. 3단계에서는 이 자리가 `findIndex(커서) + 1` 이었다.

### `take: limit + 1` 은 3단계와 같은 수법이다

`limit` 이 20이면 21건을 떠서, 21건이 오면 `hasNext = true` 로 두고 20건만 싣는다. 대안인 `COUNT(*)` 는
조건에 맞는 행을 **모두** 지나간다(아래 표에서 10000행 · 1.259 ms). 프론트가 필요한 것은 "더 보기를
보여줄까" 하나라서 `pageInfo` 에 총 개수 필드를 두지 않았다(02-api.md 2.4).

### `P2025` 번역은 이제 여기 없다

4단계에는 `update`·`remove` 에 `try`/`catch` 가 있었다 — 라우터를 안 고치려고 저장소가 `P2025` 를 잡아
`null` 로 되돌렸다. 5.7 에서 그 번역이 `errorHandler` 한 곳으로 가 `404` + `POST_NOT_FOUND` 가 됐고
저장소는 그냥 던진다. **같은 번역이 두 곳에 있으면 언젠가 갈라진다.**

**`remove` 는 이제 한 문장이다.** 딸린 댓글은 DB 가 걷어 간다(`comments.postId` 의 `ON DELETE CASCADE`). 3단계에는 두 `Map` 을 차례로
비우는 사이에 "글은 없고 댓글만 남은" 중간 상태가 있었고 지금은 그 자리가 없다.

## 왜 이렇게 했는가

1. **커서 대 offset.** offset 은 페이지 점프가 되고 구현도 짧다. 대신 뒷페이지로 갈수록 건너뛸 행이 늘어
   느려지고, 보는 동안 새 글이 들어오면 같은 글이 두 페이지에 걸쳐 보인다. 7단계에서 나란히 놓고 쟀다.
2. **커서에 `id` 만 싣는 것.** 정렬은 `(createdAt, id)` 인데 커서는 `id` 하나다. Prisma 가 그 행을 찾아
   위치를 잡아 준다. 실제로 어떤 SQL 이 되는지 7단계에서 찍어 확인했다.
3. **`update` 에 `patch.title` 을 그대로 넘기는 것.** Prisma 는 값이 `undefined` 면 그 컬럼을 건드리지 않는다.

## 7단계에서 무엇이 바뀌었나

> 아래 수치는 2026-09-23 에 **PostgreSQL 18.6** 에서 다시 잰 것이다.
> 처음 잰 16.15 값과 결론은 같고 숫자만 조금 움직였다([09-list-performance.md](../09-list-performance.md)).

글 1만 건 · 댓글 5만 건 · 유저 20명을 넣고 잰 값이다. **인덱스 전후** — `EXPLAIN ANALYZE`, `SELECT id FROM posts ORDER BY "createdAt" DESC, id DESC LIMIT 21`

| | 전 | 후 |
|---|---|---|
| 계획 | `Seq Scan` + `Sort`(top-N heapsort) | `Index Only Scan`, `Heap Fetches: 0` |
| Execution Time | **1.922 ms** | **0.049 ms** |

`@@index([createdAt(sort: Desc), id(sort: Desc)])` 의 방향이 `orderBy` 와 같아서 DB 가 인덱스를 앞에서
그대로 읽고 21건에서 멈춘다. `Heap Fetches: 0` 은 테이블 본체를 한 번도 안 열었다는 뜻이다.

**offset 대 커서** — 인덱스가 있는 상태.

| | 읽은 행 | Execution Time |
|---|---|---|
| `OFFSET 0` | 20 | 0.053 ms |
| `OFFSET 1000` | 1020 | 0.215 ms |
| `OFFSET 5000` | 5020 | 0.725 ms |
| `OFFSET 9980` | **10000** | 1.504 ms |
| 커서로 같은 자리 | **20** | 0.059 ms |
| `COUNT(*)` | 10000 | 1.259 ms |

offset 은 건너뛸 행을 **읽고 버린다** — 마지막 페이지에서 1만 행을 읽고 20행을 준다. 커서는 어디서든
20행이다. API 로도 같다: 첫 페이지 16.3 ms, 9980번째부터 커서로 12.6 ms(중앙값 15회).

**`cursor: { id }` 는 진짜 keyset 이다.**

```sql
WHERE (("createdAt" = (SELECT "createdAt" FROM posts WHERE id = $1) AND "id" <= (SELECT "id" ...))
    OR ("createdAt" < (SELECT "createdAt" ...))) ORDER BY "createdAt" DESC, "id" DESC LIMIT $4 OFFSET $5
```

커서 행의 정렬 키를 상관 서브쿼리로 꺼내 비교한다. 커서에 `id` 하나만 실어도 복합 정렬이 맞아떨어지는
이유다. 끝의 `OFFSET` 은 `skip: 1` 이 나간 것이라 한 행만 건너뛴다 — 위 표의 offset 비용과는 다르다.

**제목 검색은 인덱스를 못 탄다.** `q` 를 넘긴 목록은 `Seq Scan`, `Filter: (title ~~* '%인덱스%')`,
`Rows Removed by Filter: 9115` 다. `contains` 는 `LIKE '%…%'` 라 앞이 열려 있고 B-tree 는 앞에서부터
비교하므로, 위 인덱스를 붙인 뒤에도 이 검색만은 그대로 `Seq Scan` 이다.

## 직접 해 볼 것

1. `PRISMA_LOG=query pnpm dev` 로 띄우고 `GET /posts?limit=5` 를 보낸다. `+1` 이 `LIMIT 6` 으로 나가는지 본다.
2. `skip: 1` 을 지우고 커서로 다음 페이지를 받는다. 지난 페이지의 마지막 글이 다시 온다.
3. `{ id: dir }` 를 지우고 `createdAt` 이 같은 글을 여러 건 만든 뒤 같은 커서로 목록을 여러 번 받는다.
4. 복합 인덱스를 지우고 마이그레이션한 뒤 위 `EXPLAIN ANALYZE` 를 다시 돌린다 → `Seq Scan` + `Sort` 다.

## 3단계에서 무엇이 바뀌었나

| | 3단계 | 4단계 |
|---|---|---|
| 정렬 | 호출마다 전체를 메모리로 꺼내 `sort` | `orderBy: [createdAt desc, id desc]` |
| 커서 자르기 | `findIndex(커서) + 1` 로 배열 슬라이스 | `cursor: { id }` + `skip: 1` |
| `hasNext` | `limit + 1` 을 떠서 판정 | 같다. `take: limit + 1` |
| 없는 id 수정 | `undefined` 반환 | `P2025` 예외를 잡아 `null` 반환 |
| 글 삭제 | 댓글을 손으로 먼저 지움 | `ON DELETE CASCADE` 가 한 문장 안에서 |

`limit + 1` 기법이 그대로 남은 것이 이 표에서 볼 것이다. **"총 개수를 세지 않고 한 건 더 떠서 판정한다" 는 결정은 저장 방식과 무관하다.**

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 5.7 | **끝났다.** `P2025` 번역이 에러 핸들러로 갔고 이 파일에서 `try` 가 사라졌다 |
| 7.3 | **끝났다.** `(createdAt DESC, id DESC)` 인덱스를 붙였고 Prisma 의 `cursor` 가 keyset 임을 확인했다 |
| 7.4 | **끝났다.** `sort` 가 허용 목록을 통과한 값으로 들어온다 |
| 7.7 | **끝났다.** `include` 의 `_count` 로 댓글 수 `COUNT` N 건이 사라졌다 |
