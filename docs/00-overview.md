# 게시판 API — 무엇을 어디에 두는가

학습 프로젝트다. 출처는 아티팩트 "게시판 API 서버, 설계부터 배포까지"
(<https://claude.ai/artifact/WffCicExjmUU5R7yfvba1H>) 의 아홉 단계 커리큘럼이고,
이 레포는 그 단계를 실제 코드로 옮긴 것이다.

교육용 자료라서 **코드 파일마다 짝이 되는 해설 문서가 하나씩 있다.**
코드 첫 줄 주석에 문서 경로가 있고, 반대 방향 매칭표는 각 단계 문서에 있다.

## 읽는 순서

| 순서 | 문서 | 무엇 |
|---|---|---|
| 1 | [01-domain.md](./01-domain.md) | 리소스 3개 · 관계 3개 · 필드 · 안 만들 것 |
| 2 | [scenarios.md](./scenarios.md) | 완성 시나리오 다섯 줄. 6·9단계의 최종 검사 |
| 3 | [02-api.md](./02-api.md) | **API 명세. 코드와 어긋나면 이 문서가 기준이다** |
| 4 | [03-memory-crud.md](./03-memory-crud.md) | 서버 3단계 구현 + 코드↔문서 매칭표 |
| 5 | [04-web-architecture.md](./04-web-architecture.md) | 클라이언트 DDD 레이어와 금지 import |
| 6 | [05-design.md](./05-design.md) | 색·활자·레이아웃을 그렇게 정한 이유 |
| 7 | [06-postgres.md](./06-postgres.md) | 서버 4단계 — Docker · Prisma · 마이그레이션 · N+1 |
| 8 | [07-validation.md](./07-validation.md) | 서버 5단계 — zod 검증 · 도메인 에러 · 에러 핸들러 |
| 9 | [08-auth.md](./08-auth.md) | 서버 6단계 — argon2 · JWT · 401/403 · 리프레시 토큰 |
| 10 | [09-list-performance.md](./09-list-performance.md) | 서버 7단계 — 시드 1만 건 · 커서 · 인덱스 · N+1 |
| 11 | [10-frontend.md](./10-frontend.md) | 8단계 — 무한스크롤 · 낙관적 삭제 · 리프레시 중계 · 401/403 |
| 12 | [11-operations.md](./11-operations.md) | 서버 9단계(절반) — 환경변수 검증 · 빌드 분리 · 로그 · 종료 처리 |
| 13 | [12-deploy-prep.md](./12-deploy-prep.md) | 배포 준비 — Dockerfile 둘, 환경변수 목록, 릴리스 커맨드 |
| — | [code/](./code/) | 코드 파일별 해설 |

## 레포 구조

```
board-api/
  docs/            커리큘럼 단계 문서 + 코드 해설
  README.md        레포 첫 페이지
  server/          Express 5 REST API  ← 9단계 절반까지 구현됨 (배포만 남음)
    Dockerfile     배포용 이미지 (실제로 빌드해 돌려 봤다)
    src/
    prisma/        schema.prisma · 마이그레이션 2개 · SQL/트랜잭션 실습
    compose.yaml   PostgreSQL 18.6 (Docker)
    openapi.yaml   프론트엔드에 보여주는 명세 (GET /docs 가 Swagger UI 로 띄운다)
    requests.http  호출 컬렉션 27개
  scripts/         검사 스크립트 (회귀 43가지 · 배포 12가지 · 측정)
  web/             Next.js 16 클라이언트 (DDD 레이어)
    src/domain/          아무것도 import 하지 않는다
    src/application/     유스케이스와 포트
    src/infrastructure/  GraphQL 클라이언트 · REST 어댑터 · 토큰 저장소
    src/presentation/    컴포넌트 · 훅 · 디자인 토큰
    src/composition/     조립 지점
    src/app/             라우팅 껍데기 + api/graphql (BFF) + api/auth (쿠키 프록시)
    Dockerfile           standalone 출력으로 만든 이미지
```

`server` 와 `web` 은 한 레포의 pnpm 워크스페이스 멤버다. GraphQL 스키마를 양쪽이
공유하기 쉽고, 서버와 클라이언트 변경을 한 커밋에 담을 수 있다.

실행은 레포 루트에서 한다.

```bash
pnpm --filter board-api-server db:up   # PostgreSQL 컨테이너 (먼저)
pnpm dev:server                        # Express, 4000 (tsx watch)
pnpm dev:web                           # Next.js, 3000
```

운영 실행은 따로다 — `pnpm --filter board-api-server build` 로 `dist` 를 만들고
`start` 로 `node dist/server.js` 를 돌린다. TypeScript 도구가 끼지 않는다(9.2).

DB 가 없으면 서버가 부팅에서 죽는다. `DATABASE_URL` 을 못 찾으면 바로 멈추게 해 두었다 —
30분 돌다가 `undefined` 를 만나는 것보다 낫다.

## 정해 둔 것

커리큘럼 밖에서 추가로 정한 사항이다. 바꿀 때 고칠 위치를 같이 적었다.

| 무엇 | 어떻게 | 고칠 위치 |
|---|---|---|
| 서버 API 스타일 | **REST**. 커리큘럼 1~7단계가 전부 REST 전제다 | `docs/02-api.md` |
| 데이터베이스 | **PostgreSQL 18.6** (Docker) + **Prisma 7.10.0** 고정. 배포와 마이너까지 맞췄다 | `server/prisma/schema.prisma` |
| 요청 검증 | **zod 4** + 미들웨어 하나. 400/422 는 위치와 이슈 코드로 가른다 | `server/src/schemas/index.ts` |
| 인증 | **argon2id** 해시 + **JWT**(액세스 15분) + `httpOnly` 쿠키 리프레시(14일) | `server/src/auth/` |
| 쿠키 중계 | 로그인·재발급만 GraphQL 이 아니라 `/api/auth/*` REST 를 거친다 | `web/src/app/api/auth/` |
| 환경변수 | **zod 로 형식까지 검증하고 어긋나면 부팅에서 죽는다** | `server/src/env.ts` |
| 로그 | **pino** JSON + 요청 id + 민감한 값 마스킹 | `server/src/logger.ts` |
| 클라이언트의 API 연동 | **GraphQL**. Next.js Route Handler 에 BFF 를 두고 그 뒤에서 REST 를 호출한다 | `web/src/app/api/graphql/route.ts` |
| 클라이언트 프레임워크 | **Next.js** (App Router) | `web/` |
| 클라이언트 아키텍처 | **DDD** — 레이어 5개, 금지 import 5줄을 ESLint 가 강제한다 | `docs/04-web-architecture.md` |
| 디자인 | 흑백 + 인주색 하나, 세리프/산세리프 두 벌 | `docs/05-design.md` |
| 프론트엔드에 명세 공개 | OpenAPI 3.1 + Swagger UI | `server/openapi.yaml` |

### GraphQL 을 서버가 아니라 Next 안에 두는 이유

커리큘럼의 학습 축이 REST 다 — 상태 코드 10개 규약, URL 규칙, 멱등성, 커서 페이지네이션이
모두 REST 를 배우기 위한 장치다. 서버를 GraphQL 로 바꾸면 그 축이 사라진다.
BFF 로 두면 1~7단계가 그대로 살고, 8단계에서 스키마 설계 · 리졸버 · BFF 경계를 새로 배운다.

```
[브라우저]  useQuery
    │
    ▼
[Next.js]  /api/graphql  (BFF — 스키마와 리졸버)
    │  fetch
    ▼
[Express]  REST 11개
    │
    ▼
[Map → 4단계에서 PostgreSQL]
```

경계가 하나 늘어난 만큼 값도 하나 늘었다 — 프론트엔드가 필요한 모양으로 데이터를 요청하고,
서버는 REST 명세를 지킨다. 대신 같은 데이터를 두 번 정의하게 되므로(REST 스키마와
GraphQL 스키마) 어긋나지 않게 맞추는 일이 8단계의 과제가 된다.
