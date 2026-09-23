# 9문서 — 목록 API 고도화 (커리큘럼 7단계)

출처: 아티팩트 "게시판 API 서버, 설계부터 배포까지" 7단계
<https://claude.ai/artifact/WffCicExjmUU5R7yfvba1H>

데이터가 1만 건일 때도 목록이 빠르게 답한다. **느려 봐야 배우는 단계라 시드부터 넣고 시작한다.**

문서 번호(09)는 읽는 순서이고 커리큘럼 단계(7)와 다르다.

## 7.1 기준선

`server/prisma/7.1-seed.ts` — 글 1만 건, 댓글 5만 건, 작성자 20명. `createMany` 로 나눠 넣어 6초 걸린다.
`create` 를 5만 번 부르면 왕복이 5만 번이다.

```bash
pnpm exec tsx prisma/7.1-seed.ts
```

재기 전 상태(인덱스 없음, N+1 있음)를 적어 둔다. 이 값이 없으면 뒤의 개선을 말로만 하게 된다.

| | 값 |
|---|---|
| 목록 `limit=20` HTTP 중앙값 | 16.7 ms |
| 목록 1회에 나가는 쿼리 | 글 20건이면 **22회** (2 + N) |
| 정렬 쿼리 실행 계획 | `Seq Scan` + `Sort`, Execution Time **1.841 ms** |

## 7.2 · 7.3 offset 과 커서

커리큘럼은 offset 을 만들었다가 커서로 바꾸라고 한다. 이 프로젝트는 2단계에서 커서로 정해 두었으므로
**두 방식을 나란히 재는 것으로 대신했다.** 인덱스가 있는 상태에서 `EXPLAIN ANALYZE` 로 잰 값이다.

| 방식 | 읽은 행 | Execution Time |
|---|---|---|
| `OFFSET 0` | 20 | 0.046 ms |
| `OFFSET 1000` | 1,020 | 0.203 ms |
| `OFFSET 5000` | 5,020 | 0.727 ms |
| `OFFSET 9980` | **10,000** | 1.434 ms |
| 커서로 같은 자리 | **20** | 0.059 ms |

**읽은 행 수를 보는 것이 핵심이다.** offset 은 건너뛴 행도 읽는다. 9980번째부터 20건을 받으려고
10,000행을 읽는다. 커서는 어디서든 20행이다 — 그래서 깊이와 무관하게 일정하다.

offset 방식은 "총 몇 페이지" 를 알려면 `COUNT(*)` 를 한 번 더 내야 한다. 이 데이터에서 **1.195 ms** 다.
커서 방식은 그 질문에 답하지 않는 대신 그 비용도 내지 않는다.
**3페이지로 점프할 수 없는 것**이 커서의 값이 아니라 대가다.

API 응답 시간으로도 확인했다(중앙값 15회).

| | 값 |
|---|---|
| 첫 페이지 | 16.3 ms |
| 9980번째부터 (커서) | 12.6 ms |

깊어져도 느려지지 않는다.

### Prisma 의 `cursor` 는 진짜 keyset 인가

`cursor` + `skip: 1` 이 무엇으로 번역되는지 로그로 직접 봤다.

```sql
WHERE (("createdAt" = (SELECT "createdAt" FROM posts WHERE id = $1)
        AND "id" <= (SELECT "id" FROM posts WHERE id = $2))
    OR ("createdAt" < (SELECT "createdAt" FROM posts WHERE id = $3)))
ORDER BY "createdAt" DESC, "id" DESC
LIMIT $4 OFFSET $5
```

**복합 조건의 keyset 이 맞다.** 커서 행의 값을 상관 서브쿼리로 꺼내 비교한다.
끝의 `OFFSET` 은 전체를 건너뛰는 것이 아니라 `skip: 1`(커서 자신)이다.

정렬 키가 같은 글이 있을 때를 위해 `id` 로 한 번 더 가르는데, Prisma 가 그 조건까지 만들어 준다.

## 7.4 정렬 화이트리스트

**사용자 입력을 그대로 `orderBy` 에 넣지 않는다.** 없는 컬럼 이름으로 DB 가 죽거나,
인덱스가 없는 컬럼으로 정렬해 목록이 통째로 느려진다.

`schemas/index.ts` 의 `z.enum(SORT_KEYS)` 하나로 검증과 허용 목록이 한 곳에서 끝난다.

| 보낸 값 | 응답 |
|---|---|
| `sort=createdAt:desc` · `createdAt:asc` | `200` |
| `sort=title:asc` | `400` |
| `sort=createdAt:DESC` (대문자) | `400` |
| `sort=id` | `400` |
| `?sortt=x` (파라미터 이름 오타) | `400` |

마지막 줄이 이번에 조인 것이다. 5단계까지 `PageQuery` 가 `.loose()` 여서 모르는 파라미터를
조용히 무시했다. 그러면 오타가 "정렬이 안 먹네" 로 나타나고 원인을 찾기 어렵다. `.strict()` 로 바꿨다.

## 7.5 필터

`q`(제목 검색)와 `authorId` 가 붙었다. 검색은 `contains` 로 시작한다.

```
Seq Scan on posts
  Filter: (title ~~* '%인덱스%')
  Rows Removed by Filter: 9115
```

**인덱스를 넣어도 이 검색은 계속 `Seq Scan` 이다.** `contains` 는 `LIKE '%…%'` 로 번역되고,
앞이 열려 있는 패턴은 B-tree 인덱스를 탈 수 없다. 1만 건에서는 견딜 만하지만(HTTP 17.9 ms)
데이터가 늘면 이 줄이 먼저 무너진다.

전문 검색이 왜 따로 있는지가 여기서 드러난다. PostgreSQL 에서는 `tsvector` + GIN 인덱스이고,
그건 이번 범위 밖이다. **지금 상태를 알고 넘어가는 것**이 이 단계의 몫이다.

## 7.6 인덱스

정렬 키와 **같은 모양**으로 만든다. 방향까지 맞춰야 DB 가 인덱스를 그대로 따라 읽는다.

```prisma
@@index([createdAt(sort: Desc), id(sort: Desc)])
@@index([authorId])
```

```sql
CREATE INDEX "posts_createdAt_id_idx" ON "posts"("createdAt" DESC, "id" DESC);
CREATE INDEX "posts_authorId_idx" ON "posts"("authorId");
```

### 전후 — DB 실행 시간

`EXPLAIN ANALYZE SELECT id FROM posts ORDER BY "createdAt" DESC, id DESC LIMIT 21`

| | 전 | 후 |
|---|---|---|
| 계획 | `Seq Scan` + `Sort` (top-N heapsort) | `Index Only Scan`, `Heap Fetches: 0` |
| 읽은 행 | 10,004 | 21 |
| Execution Time | **1.841 ms** | **0.056 ms** |

**약 33배.** `Index Only Scan` 은 테이블을 아예 건드리지 않는다 — 필요한 컬럼이 인덱스 안에 다 있어서
`Heap Fetches: 0` 이다.

### 전후 — HTTP 응답 시간

| 요청 | 전 | 후 |
|---|---|---|
| 목록 `limit=20` | 16.7 ms | 15.3 ms |
| 목록 `limit=50` | 17.0 ms | 16.1 ms |
| 정렬 `asc` | 17.7 ms | 16.8 ms |
| 제목 검색 | 20.0 ms | 17.9 ms |
| 작성자 필터 | 14.8 ms | 12.5 ms |

**여기가 이 단계에서 가장 정직한 숫자다.** DB 시간은 33배 줄었는데 HTTP 는 1~2 ms 움직였다.
1만 건 규모에서 **병목은 DB 가 아니었다.** 남은 15 ms 는 HTTP 왕복, JSON 직렬화,
Node 의 이벤트 루프, 그리고 로컬 Docker VM 을 지나는 비용이다.

커리큘럼은 "이 커리큘럼에서 가장 인상적인 숫자가 여기서 나온다" 고 했다. 나왔다 —
다만 **실행 계획 쪽에서** 나왔다. 데이터가 100만 건이 되면 응답 시간 쪽에서도 나올 것이다.
지금 인덱스를 넣는 이유는 그때를 위해서다.

## 7.7 N+1 제거

`include` 로 작성자와 댓글 수를 목록 쿼리에 접어 넣었다.

```ts
include: {
  author: { select: { id: true, nickname: true } },
  _count: { select: { comments: true } },
}
```

| 목록에 담긴 글 | 전 | 후 |
|---|---|---|
| 1건 | 3회 | **2회** |
| 20건 | 22회 | **2회** |
| 50건 | 52회 | **2회** |

**글 수와 무관한 상수가 됐다.** 남은 2회는 이것이다.

1. 글 + 댓글 수 — `_count` 가 `LEFT JOIN … GROUP BY` 로 접혀 한 쿼리 안에 들어간다.
2. 작성자 — `WHERE id IN ($1,…,$21)`.

2번을 1번에 합치려면 `relationLoadStrategy: "join"` 이 필요한데, **Prisma 7.10.0 의 클라이언트에는
그 옵션이 없다.** 넣어 보고 타입에서 걸렸고, 생성된 타입 정의를 뒤져도 나오지 않았다.
2회는 상수이므로 N+1 은 해소됐고, 1회로 줄이는 것은 여기서 멈춘다.

`views.ts` 쪽도 바뀌었다. `postListItemView` 가 **더 이상 async 가 아니다** —
저장소가 값을 들고 오므로 모양만 고른다. 라우터에서 `Promise.all` 이 사라졌다.

## 이 단계의 통과 조건

- [x] 1만 건 기준 목록 응답 시간을 인덱스 전/후로 각각 기록했다
- [x] 목록 1회 호출의 쿼리 수가 상수다 (글이 1개든 50개든 2회)
- [x] 모르는 정렬 키를 보내면 `500` 이 아니라 `400` 이 온다

### 검증 기록 (2026-09-22)

데이터: 글 10,001건 · 댓글 50,000건 · 유저 20명.

| 무엇 | 어떻게 | 결과 |
|---|---|---|
| 쿼리 수 상수 | `PRISMA_LOG=query` 로 `limit=1·20·50` | 전부 **2회** |
| 인덱스 전후 | `EXPLAIN ANALYZE` | 1.841 ms → **0.056 ms**, `Seq Scan` → `Index Only Scan` |
| HTTP 전후 | 15회 중앙값, 5가지 요청 | 위 표 (16.7 → 15.3 ms 등) |
| offset 대 커서 | `EXPLAIN ANALYZE`, 깊이 0·1000·5000·9980 | 읽은 행 20 → 10,000 대 커서 20 고정 |
| 커서 SQL | 쿼리 로그 | 복합 keyset 확인 |
| 정렬 화이트리스트 | 5가지 `sort` 값 + 파라미터 오타 | 허용 2개만 `200`, 나머지 `400` |
| 정렬이 실제로 뒤집히는가 | `asc`·`desc` 첫 글 비교 | "에러 처리 이야기 1" ↔ "JWT 이야기 10000" |
| 회귀 | 3~6단계 검사 40가지 | **40 통과 · 0 실패** |
| 타입 | `tsc --noEmit` | 오류 0 |

## 겪은 것

**회귀 스크립트가 시드를 지웠다.** 5단계에서 "몇 번 돌려도 같은 결과" 를 만들려고 검사 시작에
`TRUNCATE` 를 넣었는데, 1만 건을 넣고 그 스크립트를 돌리자 전부 사라졌다.
측정은 이미 끝난 뒤라 잃은 것은 없었지만, **검사 스크립트가 데이터를 지운다는 사실을 기억해야 한다.**
성능 측정과 회귀 검사는 같은 DB 에서 번갈아 돌릴 수 없다.

## 남은 것

- **무한스크롤을 아직 붙이지 않았다.** 서버는 커서를 주고 클라이언트의 `useInfiniteQuery` 도 준비돼 있지만,
  화면에서 "더 보기" 를 눌러야 다음 장이 온다. 자동으로 이어 붙이는 것은 8단계다.
- `q` 검색이 `Seq Scan` 이다. 데이터가 더 늘면 전문 검색으로 옮겨야 한다.
- 댓글 목록에는 인덱스 외에 손대지 않았다. 한 글에 댓글이 수천 개 달리는 경우는 이 범위 밖이다.

## 다음 단계

8단계는 프론트 연결이다. 이미 Next.js 클라이언트와 GraphQL BFF 가 있으므로
남은 것은 무한스크롤 배선, 낙관적 업데이트, 그리고 **6단계에서 미룬 리프레시 토큰 중계**다.
BFF 가 `Set-Cookie` 를 옮겨 주어야 브라우저가 15분마다 다시 로그인하지 않는다.
