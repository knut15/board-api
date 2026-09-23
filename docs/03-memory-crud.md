# 3단계 — 메모리 저장으로 CRUD

출처: 아티팩트 "게시판 API 서버, 설계부터 배포까지" 3단계
<https://claude.ai/artifact/WffCicExjmUU5R7yfvba1H>

DB 없이 `Map` 만으로 [02-api.md](./02-api.md) 의 11개 엔드포인트를 그대로 구현한다.
저장소를 빼 놓고 **HTTP 계층만** 본다. 서버를 껐다 켜면 데이터가 사라지는 것이 이 단계의 결론이고,
그게 4단계로 가는 이유다.

## 코드와 문서 매칭

코드 파일 첫 줄 주석에 짝이 되는 문서 경로가 적혀 있다. 반대 방향은 이 표다.

| 코드 | 문서 | 커리큘럼 | 무엇을 배우는 파일인가 |
|---|---|---|---|
| `server/src/server.ts` | [code/server.md](./code/server.md) | 3.1 · 3.2 | 포트를 열고 듣는 일과 app 을 만드는 일을 나누는 이유 |
| `server/src/app.ts` | [code/app.md](./code/app.md) | 3.3 · 3.5 · 3.6 | **미들웨어 등록 순서가 곧 요청이 지나가는 길** |
| `server/src/middleware/logger.ts` | [code/middleware-logger.md](./code/middleware-logger.md) | 3.3 | 미들웨어의 3인자 서명, `next()`, `res.on("finish")` |
| `server/src/middleware/currentUser.ts` | [code/middleware-current-user.md](./code/middleware-current-user.md) | 3.6 · 6.4 | 인증 흉내, 선언 병합, 401 과 403 의 구분 |
| `server/src/store/prisma.ts` | [code/store-prisma.md](./code/store-prisma.md) | 4.4 | PrismaClient 하나, 드라이버 어댑터, 쿼리 로그 |
| `server/src/store/users.ts` | [code/store-users.md](./code/store-users.md) | 3.4 · 4.5 | 저장 방식과 무관한 함수 이름, 평문 비밀번호의 의도된 미완성 |
| `server/src/store/posts.ts` | [code/store-posts.md](./code/store-posts.md) | 3.4 · 4.5 · 7.3 | 커서 페이지네이션, `limit + 1` 로 `hasNext` 를 아는 법 |
| `server/src/store/comments.ts` | [code/store-comments.md](./code/store-comments.md) | 3.4 · 4.3 · 4.5 | N+1 의 씨앗, 트랜잭션이 없을 때 생기는 중간 상태 |
| `server/src/views.ts` | [code/views.md](./code/views.md) | 2.4 · 3.6 | 응답 조립을 한 곳에 모아 형태가 갈라지지 않게 하는 법 |
| `server/src/respond.ts` | [code/respond.md](./code/respond.md) | 2.4 · 3.6 | 에러 봉투를 한 군데서 만드는 이유 |
| `server/src/routes/auth.ts` | [code/routes-auth.md](./code/routes-auth.md) | 3.5 · 6.2 | 400 → 422 → 409 검사 순서, 로그인 실패를 뭉치는 이유 |
| `server/src/routes/posts.ts` | [code/routes-posts.md](./code/routes-posts.md) | 3.5 · 3.6 | 쿼리 파라미터 파싱, 존재 검사가 권한 검사보다 먼저인 이유 |
| `server/src/routes/comments.ts` | [code/routes-comments.md](./code/routes-comments.md) | 3.5 · 3.6 | `mergeParams`, 부모 리소스 존재 확인, 좁은 권한 |

읽는 순서는 위에서 아래다. `server.ts` → `app.ts` 로 요청이 들어오는 길을 먼저 보고,
`store` 로 데이터가 어디 있는지 보고, `routes` 에서 둘이 만나는 것을 본다.

## 코드 밖의 파일

| 파일 | 무엇 |
|---|---|
| `server/requests.http` | 커리큘럼 3.7 의 호출 컬렉션. 27개 요청. **버리지 않는다** — 5·6·7단계의 회귀 검사다 |
| `server/openapi.yaml` | 프론트엔드 개발자에게 보여주는 API 명세. `02-api.md` 와 1:1 |
| `server/tsconfig.json` | ESM + `NodeNext`. 상대 경로 import 에 `.js` 확장자가 붙는 이유가 여기 있다 |

### 왜 import 에 `.js` 를 쓰는가

`import { createApp } from "./app.js"` 인데 파일은 `app.ts` 다. 오타가 아니다.
`"type": "module"` + `moduleResolution: NodeNext` 는 Node 의 ESM 규칙을 그대로 따르고,
Node 는 확장자를 생략한 상대 import 를 해석하지 않는다. TypeScript 는 `.js` 를 쓰면
`.ts` 를 찾아 컴파일하고 출력에는 `.js` 를 남긴다. 9.2 의 `tsc` 빌드가 그대로 도는 이유다.

## 실행

의존성을 설치한 뒤,

```bash
pnpm install          # 레포 루트에서
pnpm dev:server       # 또는 pnpm --filter board-api-server dev
```

`http://localhost:4000/health` 가 `{ "ok": true }` 를 주면 뜬 것이다.
그다음 `server/requests.http` 를 위에서 아래로 누른다.

## 3단계에서 일부러 안 한 것

이 단계에 없다고 빠뜨린 것이 아니다. 다음 단계의 재료다.

> **이 문서는 3단계 시점의 기록이다.** 4단계에서 저장소가 PostgreSQL 로 바뀌었고
> 라우터도 비동기가 됐다. 지금 코드 기준의 설명은 [06-postgres.md](./06-postgres.md) 에 있다.

| 안 한 것 | 어디서 | 지금 |
|---|---|---|
| 영속성 — 재시작하면 전부 사라진다 | 4단계 | **됨** |
| zod 검증. 지금은 핸들러 안의 `if` 문이다 | 5.2 | 아직 |
| 에러 핸들러가 형태를 만드는 구조. 지금은 `fail()` 을 직접 부른다 | 5.5 · 5.6 | 아직 |
| 비밀번호 해싱 — 평문이다 | 6.1 | 아직 |
| 진짜 토큰 — 지금 `token` 은 유저 id 다 | 6.3 | 아직 |
| `sort` · `q` · `authorId` — 받아도 무시한다 | 7.4 · 7.5 | 아직 |
| 트랜잭션 — 글 삭제 중간에 죽으면 댓글이 남는다 | 4.7 | **CASCADE 로 해소** |

## 이 단계의 통과 조건

- [x] 11개 엔드포인트가 명세대로 응답한다 (상태 코드까지 표와 일치)
- [x] 호출 컬렉션 하나로 전부 순서대로 돌릴 수 있다 (`server/requests.http`)
- [x] 서버를 껐다 켜면 데이터가 사라지는 것을 직접 확인했다

### 검증 기록 (2026-09-22)

| 무엇 | 어떻게 | 결과 |
|---|---|---|
| 타입 체크 | `pnpm --filter board-api-server typecheck` | 오류 0 |
| 엔드포인트 전수 | curl 로 성공·실패 경로 36가지 | 36 통과 · 0 실패 |
| 응답 형태 | 목록 `{ items, pageInfo }`, 항목에 `body` 없음, `commentCount`·`author` 있음 | 일치 |
| 상세 1회 호출 | `GET /posts/:id` 응답에 댓글 1건 포함 | 확인 |
| `PATCH` 부분 수정 | `title` 만 보내면 `body` 는 그대로, `updatedAt` 갱신 | 확인 |
| 멱등성 결정 | 같은 `DELETE` 두 번 → `204` 다음 `404` | 확인 |
| **영속성 없음** | 글 1건을 만든 뒤 서버 종료·재시작 | 글 0건, 기존 유저로 `/me` 는 `401` |

마지막 줄이 4단계로 가는 이유다. 데이터가 프로세스 안에 있으면 프로세스와 함께 사라진다.
