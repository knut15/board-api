# 12문서 — 배포 준비 (커리큘럼 9.3 · 9.4 앞자리)

플랫폼을 정하기 전에 해 둘 수 있는 것을 해 뒀다.
**이미지 두 개가 실제로 빌드되고, 서로 붙고, DB 에 연결되는 것까지 확인했다.**

남은 것은 플랫폼 계정과 거기서 하는 설정뿐이다.

## 무엇을 만들었나

| 파일 | 무엇 |
|---|---|
| `server/Dockerfile` | Express 이미지. 4단계 빌드(deps → build → bundle → runtime) |
| `web/Dockerfile` | Next.js 이미지. `output: "standalone"` 을 쓴다 |
| `.dockerignore` | `.env` 가 이미지에 들어가는 것을 막는다 |
| `web/next.config.ts` | `output: "standalone"` + `outputFileTracingRoot` |

## 환경변수 — 플랫폼에 넣을 값

### Express 서버

| 이름 | 필수 | 형식 | 비고 |
|---|---|---|---|
| `DATABASE_URL` | **예** | `postgresql://…` | 플랫폼의 Postgres 가 주는 내부 주소 |
| `JWT_SECRET` | **예** | 32자 이상 | `openssl rand -hex 32`. **로컬 값을 그대로 쓰지 않는다** |
| `PORT` | 아니오 | 1–65535 | 기본 4000. 플랫폼이 정해 주는 경우가 많다 |
| `NODE_ENV` | 아니오 | `production` | 리프레시 쿠키의 `secure` 를 켠다 |
| `LOG_LEVEL` | 아니오 | `info` 등 | 기본 `info` |
| `CORS_ORIGIN` | 아니오 | — | BFF 구조에서는 비워 둔다(8.1) |

하나라도 어긋나면 **부팅에서 죽는다**(9.1). 그것이 의도다.

### Next.js 클라이언트

| 이름 | 필수 | 비고 |
|---|---|---|
| `BOARD_API_URL` | **예** | 플랫폼 안에서 Express 를 가리키는 주소. 기본값 `http://localhost:4000` 은 배포에서 아무것도 가리키지 않는다 |
| `PORT` | 아니오 | 기본 3000 |

`BOARD_API_URL` 은 **서버 안에서만 쓰인다.** 브라우저는 이 값을 모르고 알 필요도 없다 —
BFF 가 대신 부르기 때문이다. 그래서 `NEXT_PUBLIC_` 접두사를 붙이지 않았다.

## 릴리스 커맨드

```
./node_modules/.bin/prisma migrate deploy
```

배포할 때마다 이것을 먼저 돌리고 서버를 띄운다.

**`migrate dev` 를 운영에서 절대 쓰지 않는다.** 스키마를 맞추려고 데이터를 지울 수 있고,
비대화식 환경에서는 아예 멈춘다 — 6단계에서 `password` → `passwordHash` 를 바꿀 때 실제로 겪었다.

**마이그레이션을 `CMD` 에 넣지 않았다.** 컨테이너가 여러 개 뜨면 동시에 돌게 된다.
플랫폼의 릴리스 훅(배포당 한 번 도는 자리)에 맡기는 것이 맞다.

## 헬스체크

| 서비스 | 경로 |
|---|---|
| Express | `GET /health` → `{"ok":true}` |
| Next | `GET /` |

두 이미지 모두 `HEALTHCHECK` 를 들고 있어서 도커만으로도 상태가 보인다.
플랫폼에도 같은 경로를 물린다.

## 플랫폼에서 해야 할 것

어느 플랫폼이든 모양은 같다.

1. **서비스 셋** — Postgres · Express · Next
2. **Express**: `server/Dockerfile` 로 빌드, 위 환경변수 주입, 릴리스 커맨드 연결, `/health` 물리기
3. **Next**: `web/Dockerfile` 로 빌드, `BOARD_API_URL` 을 Express 의 내부 주소로
4. **도메인**: Next 쪽에 붙인다. Express 는 바깥에 열지 않아도 된다 — BFF 만 부른다

4번이 이 구조의 덤이다. **Express 를 인터넷에 노출하지 않아도 된다.**

## 검증 기록 (2026-09-23)

플랫폼 없이 도커만으로 여기까지 확인했다.

| 무엇 | 어떻게 | 결과 |
|---|---|---|
| 서버 이미지 빌드 | `docker build -f server/Dockerfile .` | 성공, **730MB** |
| 클라이언트 이미지 빌드 | `docker build -f web/Dockerfile .` | 성공, **301MB** |
| 서버 기동 | 호스트 Postgres 에 연결 | `/health` `{"ok":true}`, 목록 조회 성공 |
| 로그 | 컨테이너 로그 | `{"level":30,…,"env":"production","msg":"listening"}` |
| 헬스체크 | `docker inspect` | `healthy` |
| 릴리스 커맨드 | 컨테이너에서 `prisma migrate deploy` | `4 migrations found` · `No pending migrations to apply.` |
| 환경변수 검증 | 틀린 값으로 기동 | 이유를 한 줄씩 찍고 종료 |
| 종료 처리 | `docker stop -t 15` | `shutting down` → `closed`, **종료 코드 0** |
| 두 컨테이너 연결 | 같은 네트워크, `BOARD_API_URL=http://server-test:4000` | 페이지 200, BFF 목록·로그인 모두 성공 |

## 겪은 것 셋 — 전부 배포에서 터졌을 것들

**1. `prisma.config.ts` 가 `.env` 를 무조건 읽었다.**
로컬에는 파일이 있어서 드러나지 않았다. 도커 빌드에서 `ENOENT: no such file or directory, open '.env'` 로 죽었다.
배포 환경에는 `.env` 가 없는 것이 정상이다 — `existsSync` 로 감쌌다.

**2. `prisma generate` 가 `DATABASE_URL` 을 요구했다.**
생성은 DB 에 붙지 않는데 설정 로딩에서 값을 찾는다. 빌드 단계에만 자리표시자를 준다.
**그 값을 이미지 `ENV` 로 남기지 않았다** — 남으면 플랫폼이 주입을 잊었을 때
부팅이 실패하는 대신 엉뚱한 주소로 붙으려 든다. 조용히 틀리는 쪽이 더 나쁘다.

**3. `pnpm deploy` 가 Prisma 생성물을 빠뜨렸다.**
스토어의 패키지 원본을 복사하므로 앞 단계에서 만든 클라이언트가 따라오지 않는다.
실행하면 `Named export 'PrismaClient' not found` 로 죽었다.
최종 단계에서 `prisma generate` 를 한 번 더 돌려 해결했다.

셋 다 **로컬에서는 멀쩡하고 배포에서만 터지는** 종류다. 이미지를 실제로 빌드해 돌려 보지 않았으면
플랫폼 로그를 보며 찾았을 것이다.

## 남은 이야기

**이미지가 크다.** 서버 730MB 의 대부분은 Prisma 쿼리 엔진과 `node_modules` 다.
릴리스 커맨드가 `prisma` CLI 를 쓰기 때문에 `--prod` 로 줄이지 못했다.
마이그레이션을 별도 작업으로 떼면 런타임 이미지를 크게 줄일 수 있지만, 그러면 배포 절차가
한 겹 복잡해진다. 학습 프로젝트에서는 단순한 쪽을 골랐다.

**`compose.yaml` 의 프로젝트 이름**은 아직 `server` 다(`11-operations.md` 마지막 절).
배포와는 무관하지만 로컬에서 다른 레포와 부딪힐 수 있다.
