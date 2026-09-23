# server/src/store/prisma.ts

> 커리큘럼 4.4 · 4.6 · 짝: `server/src/store/prisma.ts`

## 무엇을 하는 파일인가

`PrismaClient` 를 하나 만들어 내보낸다. 저장소 세 파일(`users.ts` · `posts.ts` · `comments.ts`)이
전부 여기서 `prisma` 를 가져다 쓴다. 도메인 로직은 한 줄도 없다 — **DB 에 어떻게 붙고 그 연결을
어떻게 나눠 쓰는가**만 정한다. 4단계에서 새로 생긴 파일이고, 3단계에는 짝이 없었다.
각 저장소가 자기 `Map` 을 들고 있었고 `Map` 에는 연결할 것이 없었기 때문이다.

## 코드를 따라 읽기

### 클라이언트를 한 번만 만든다

```ts
export const prisma = new PrismaClient({ adapter, log: … });
```

모듈 맨 위에서 한 번 만들고 내보낸다. ES 모듈은 같은 경로를 몇 번 import 하든 몸통을 한 번만
실행하므로 세 저장소가 받아 가는 `prisma` 는 전부 같은 객체다. 파일마다 `new PrismaClient()` 를 하면 클라이언트 하나가 연결 풀 하나를 들고 있으니 만든 수만큼
풀이 생긴다. 여기에 개발 서버가 `tsx watch` 라는 사정이 겹친다 — 파일을 고칠 때마다 모듈을 다시
읽고 새 클라이언트가 생기며, 먼저 만든 연결은 닫히지 않은 채 쌓인다.

### Prisma 7 은 드라이버 어댑터를 거쳐야 DB 에 붙는다

```ts
const adapter = new PrismaPg({ connectionString: url });
export const prisma = new PrismaClient({ adapter, … });
```

6 버전까지는 `PrismaClient` 가 자체 엔진으로 PostgreSQL 에 곧장 붙었다. 7 부터는 드라이버 어댑터를
끼워야 한다. 여기서 쓰는 것은 node-postgres(`pg`)를 감싼 `@prisma/adapter-pg` 의 `PrismaPg` 다.
`server/package.json` 에 `@prisma/client` 와 `@prisma/adapter-pg` 가 둘 다 있는 이유가 이것이다.

연결 주소도 같은 방향으로 옮겨 갔다. `prisma/schema.prisma` 의 `datasource db` 블록에는 `url` 이 없고,
마이그레이션 CLI 가 쓸 주소는 `server/prisma.config.ts` 가, 서버가 돌 때 쓸 주소는 이 파일이 각각
`DATABASE_URL` 에서 읽는다. 스키마는 "무엇이 있는가" 만 말한다.

### 주소가 없으면 부팅에서 죽인다

```ts
const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL 이 없습니다. server/.env 를 확인하세요.");
}
```

없는 채로 넘어가면 서버는 멀쩡히 뜨고, 첫 DB 요청이 들어오는 순간 `500` 이 난다. 설정이 빠진 것을
한참 뒤에, 그것도 사용자의 요청으로 알게 되는 셈이다. 부팅에서 죽으면 로그 한 줄과 함께 즉시 안다.
**틀린 설정으로 뜨는 서버보다 뜨지 않는 서버가 낫다.** 지금 막는 것은 `DATABASE_URL` 하나뿐이고,
9.1 에서 환경변수 전체를 zod 스키마로 검증하면서 이 `if` 가 그 스키마의 한 줄로 흡수된다.

`.env` 는 `process.loadEnvFile?.(".env")` 로 읽는다. Prisma 7 은 `.env` 를 알아서 읽어 주지 않는데,
`dotenv` 대신 Node 22 의 내장 함수를 써서 의존성을 늘리지 않았다.

### 쿼리 로그는 환경변수로 켜고 끈다

```ts
log: process.env.PRISMA_LOG === "query" ? ["query"] : [],
```

`PRISMA_LOG=query pnpm dev` 로 켜면 나가는 SQL 이 전부 찍히고, 그냥 `pnpm dev` 면 조용하다.
항상 켜 두지 않는 이유는 목록 한 번에 수십 줄이 쏟아져 그 밖의 로그가 묻히기 때문이다.

4.6 의 쿼리 수를 이것으로 셌다. `GET /posts` 한 번에 나간 쿼리는 **글 1건 → 3회, 5건 → 7회,
10건 → 12회, 20건 → 22회**이고, 내역은 언제나 `posts` SELECT 1회 + `users` SELECT 1회 + 글마다
`COUNT` 1회, 즉 **2 + N** 이었다.

작성자 조회가 N 이 아니라 1인 것이 눈에 띄는 지점이다. `views.ts` 는 글마다 `users.findById` 를
부르는데 **Prisma 가 그 `findUnique` 들을 `WHERE id IN ($1,…,$N)` 하나로 묶었다**(findUnique 배칭).
묶이지 않은 것은 댓글 수 `COUNT` 뿐이고, 그것이 남은 N+1 이다. 7.7 에서 `_count` 로 걷어낸다.

## 왜 이렇게 했는가

1. **싱글턴을 모듈로 만든 것.** `getPrisma()` 같은 함수로 감싸 지연 생성할 수도 있었다. 그러면
   부르는 쪽이 매번 함수를 거쳐야 하고, 저장소 세 파일이 전부 한 줄씩 길어진다. 모듈 최상단 상수는
   import 하는 것만으로 같은 객체가 보장되므로 더 얹을 것이 없다.
2. **주소를 두 군데서 읽는 것.** `prisma.config.ts` 도 `DATABASE_URL` 을 읽는다. 합치는 선택지도
   있었지만 설정 파일은 CLI 전용이고 서버 런타임에서 읽히지 않는다. 쓰임이 다른 두 곳이라 각자 읽게 뒀다.
3. **로그를 끄는 것이 기본인 것.** 4.6 실습은 로그를 켜는 순간만 필요하다. 기본이 켜져 있으면
   실습이 끝난 뒤 끄는 것을 잊고 그 상태가 남는다.

## 직접 해 볼 것

1. `PRISMA_LOG=query pnpm dev` 로 띄우고 `GET /posts?limit=5` 를 보낸다. 찍힌 쿼리가 7회인지,
   `users` 쿼리가 `IN (…)` 한 줄인지 확인하고, 글 수를 바꿔 가며 2 + N 이 유지되는지 본다.
2. `users.ts` 안에서 `new PrismaClient()` 를 따로 만들어 쓰게 바꾼 뒤 `tsx watch` 상태로 파일을 여러 번
   저장한다. `pnpm db:psql` 에서 `SELECT count(*) FROM pg_stat_activity;` 로 연결 수 변화를 본다.
3. `server/.env` 의 `DATABASE_URL` 줄을 주석 처리하고 띄운다. 어느 시점에 죽는지 확인하고,
   `if (!url)` 블록을 지운 뒤 다시 해 본다 — 이번에는 서버가 뜨고 첫 요청에서 터진다.

## 3단계에서 무엇이 바뀌었나

3단계에 이 파일은 없었다. 저장은 각 저장소 안의 `Map` 이 맡았고 연결·풀·설정이라는 개념 자체가
없었다. 세 저장소가 공유할 것이 생기면서 그 자리를 이 파일이 받았다.

눈에 보이는 결과는 데이터가 프로세스보다 오래 산다는 것이다. 서버를 껐다 켜도 글과 댓글이 남고,
재시작 전에 만든 글을 다시 조회해 `200` 이 나온다. 3단계에서는 같은 순서가 `404` 였다.
3단계 회귀 검사 36가지를 DB 위에서 다시 돌려 **36 통과 · 0 실패**였다 — 겉으로 보이는 동작은
그대로 두고 아래만 갈아 끼웠다는 뜻이다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 4.7 | 글 삭제 같은 여러 문장을 `prisma.$transaction` 으로 묶는다. 트랜잭션 API 도 이 클라이언트에서 나온다 |
| 5.7 | 에러 핸들러가 Prisma 에러 코드를 응답 코드로 번역한다. 원문 코드는 응답에 담지 않는다(02-api.md 2.4) |
| 7.7 | `_count` 로 목록의 `COUNT` N 건이 사라진다. 같은 로그 켜기로 쿼리 수를 다시 센다 |
| 9.1 | `DATABASE_URL` 검사가 환경변수 스키마 한 곳으로 옮겨 간다 |
