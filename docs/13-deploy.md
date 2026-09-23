# 13문서 — 배포와 운영, 나머지 절반 (커리큘럼 9.3 · 9.4 · 9.7 · 9.8)

[11-operations.md](./11-operations.md) 에서 계정 없이 되는 넷(9.1 · 9.2 · 9.5 · 9.6)을 했고,
[12-deploy-prep.md](./12-deploy-prep.md) 에서 이미지 두 개를 빌드해 돌려 봤다.
여기서 실제로 올린다.

**공개 URL: https://web-production-76a42.up.railway.app**

## 9.3 대시보드를 클릭하지 않았다

Railway 는 웹 화면에서 서비스를 만들고 환경변수를 넣게 되어 있다. 그렇게 하지 않았다.
**클릭은 기록이 남지 않는다** — 왜 그 값인지, 언제 바뀌었는지 아무도 모른다.

`railway config` 가 IaC 를 지원한다. 프로젝트 전체를 `.railway/railway.ts` 한 파일에 선언하고
`plan` 으로 미리 보고 `apply` 한다. 이 파일은 커밋된다.

```
railway config plan
  Plan: 3 to add, 0 to change, 0 to destroy
    + Create database db
    + Create service server
    + Create service web
```

### 무엇이 만들어졌나

```
브라우저 ──https(443)──▶ web-production-76a42.up.railway.app
                              │
                         web  :3000          공개 도메인 있음
                              │ http://server.railway.internal:4000
                              ▼
                       server :4000          공개 도메인 없음
                              │ db.railway.internal:5432
                              ▼
                       Postgres 18.6         공개 도메인 없음
```

**밖에서 닿을 수 있는 것은 web 하나뿐이다.** BFF 가 Express 를 대신 부르므로 서버를 인터넷에
열 이유가 없다. `RAILWAY_PUBLIC_DOMAIN` 이 web 에만 있는 것이 그 증거다.

포트를 IaC 에 못 박았다(`server` 4000, `web` 3000). 내부 주소로 서로를 부르려면
그 값이 예측 가능해야 한다.

### 설정에서 맞물린 숫자 하나

```ts
drainingSeconds: 15,   // SIGTERM 을 보낸 뒤 SIGKILL 까지
```

9.6 에서 만든 종료 처리의 강제 종료 타임아웃이 **10초**다. 플랫폼이 기다려 주는 시간이
그보다 짧으면 정상 종료가 끝나기 전에 죽는다. 두 숫자는 따로 정하면 안 된다.

## 9.4 마이그레이션은 배포당 한 번

```ts
preDeploy: "./node_modules/.bin/prisma migrate deploy",
```

`CMD` 에 넣지 않은 이유는 **컨테이너가 여러 개 뜨면 동시에 돌기 때문**이다.
플랫폼의 릴리스 훅은 배포당 한 번만 돈다.

`migrate dev` 는 운영에서 쓰지 않는다. 스키마를 맞추려고 데이터를 지울 수 있고,
비대화식 환경에서는 아예 멈춘다 — 6단계에서 `password` → `passwordHash` 를 바꿀 때 실제로 겪었다.

빈 DB 에 마이그레이션 4개가 적용됐고, 목록 질의가 에러가 아니라 **빈 배열**을 돌려준 것이
테이블이 생겼다는 증거였다.

## 9.7 공개 URL 에서 완성 시나리오 — 11/11

1.5 에서 정한 다섯 줄을 배포된 주소로 돌렸다.

| 시나리오 | 결과 |
|---|---|
| 1 가입 | 닉네임 반환, 응답에 비밀번호·해시 없음 |
| 2 로그인 | 점 2개짜리 JWT + `HttpOnly` 리프레시 쿠키 |
| 3 글 작성 | 제목 그대로 |
| 4 남의 글에 댓글 | 작성자 `lee` |
| 5 남의 글 수정 | **`FORBIDDEN`**, 제목이 안 바뀜 |
| 토큰 없이 글 쓰기 | `UNAUTHENTICATED` |
| 없는 글 조회 | `POST_NOT_FOUND` |
| 쿠키로 토큰 재발급 | 성공 |

도메인은 web 에만 붙였다. HTTPS 는 플랫폼이 붙여 준다.

## 9.8 일부러 장애를 냈다

`server` 서비스에서 `JWT_SECRET` 을 지웠다.

### 첫 번째 배움 — 지워도 아무 일이 없었다

```
공개 URL 200
{"data":{"posts":{"items":[{"title":"공개 URL 에서 쓴 첫 글"}]}}}
```

**이미 도는 컨테이너는 옛 환경을 들고 있다.** 환경변수를 지운 그 순간에는 멀쩡하다.
장애는 **다음 배포에서** 터진다 — 며칠 뒤, 그 변경과 아무 상관없는 배포를 했을 때.

이게 더 고약한 종류다. 원인과 증상 사이에 시간이 끼어 있으면 아무도 둘을 잇지 못한다.

### 두 번째 배움 — 로그를 잘못 보고 있었다

재배포하니 `Deploy failed`. 로그를 봤더니 **정상적인 요청 로그만 흐르고 있었다.**

`railway logs` 는 기본적으로 **마지막 성공 배포**를 본다. 실패한 배포의 로그를 보려면
그 배포를 짚어야 한다.

```
railway deployment list --service server
  e3a391ce-… | FAILED  | 11:43:50
  441423b1-… | SUCCESS | 11:30:53
```

### 세 번째 — 로그가 원인을 그대로 말했다

```
환경변수가 올바르지 않습니다:
  JWT_SECRET — 반드시 있어야 합니다.
```

9.1 에서 "무엇이 왜 틀렸는지 한 줄씩" 찍게 한 값이 여기서 돌아왔다.
`invalid env` 한 줄이었으면 어느 값인지 찾느라 배포 설정을 뒤졌을 것이다.

복구 후 9.7 게이트를 다시 돌려 11/11.

## 배포하며 물린 것 셋

### 1. 이미지 태그를 바꾸는 것은 업그레이드가 아니다

로컬(16)에 맞추려고 Railway 의 Postgres 이미지를 16 으로 못 박았다. 이미 18 로 초기화된
데이터 디렉터리 위에서 Postgres 가 뜨기를 거부했다.

```
This image runs PostgreSQL 16 but the data directory holds major version 18.
Changing the image tag does not upgrade the data files.
```

**더 고약한 것은 서비스가 `Online` 으로 보였다는 점이다.** 실제로는 재시작을 반복하고 있었다.
상태 표시를 믿지 말고 로그를 봐야 한다.

### 2. 첫 배포가 DB 에 못 닿았다

```
Error: P1001: Can't reach database server at `db.railway.internal:5432`
```

내부 네트워크 문제인 줄 알았는데 원인은 1번이었다. **DB 가 애초에 떠 있지 않았다.**

### 3. 검사 스크립트가 또 서버를 의심하게 만들었다

게이트에서 `GRAPHQL_PARSE_FAILED` 가 떴다. 같은 질의를 직접 보내니 정상이었다 —
셸 따옴표가 질의 문자열을 깨뜨린 것이었다. 변수 형태로 바꿔 해결했다.

`verification-scripts` 스킬에 적어 둔 그대로다. **검사가 실패했다고 코드가 틀린 것은 아니다.**

## 개발과 운영의 버전을 맞췄다

Railway 의 관리형 Postgres 는 18 이고 로컬은 16.15 였다. 관리형 템플릿은 버전 고정을 받지 않는다 —
이미지를 직접 지정하면 볼륨을 손수 선언해야 하고 백업·업그레이드 도구를 잃는다.

그래서 **로컬을 18.6 으로 올렸다.** 이 프로젝트는 "로컬에서 멀쩡한 것이 배포에서만 다르게 도는"
일을 이미 세 번 겪었다(`prisma.config.ts` 의 `.env`, `prisma generate` 의 `DATABASE_URL`,
`pnpm deploy` 의 생성물). 버전 차이를 남겨 두면 네 번째가 된다.

### 올리다 걸린 것 — 18 이 도커 데이터 배치를 바꿨다

```
Error: in 18+, these Docker images are configured to store database data in a
       format which is compatible with "pg_ctlcluster"
```

17 까지는 `/var/lib/postgresql/data` 에 마운트했는데 18 은 `/var/lib/postgresql` 이다.
데이터는 메이저 버전별 하위 디렉터리로 들어간다.

### 측정을 다시 쟀다

7단계 수치는 16.15 에서 잰 것이었다. 18.6 에서 다시 쟀고
[09-list-performance.md](./09-list-performance.md) 를 갱신했다.
**결론은 그대로이고 숫자만 움직였다** — 인덱스 전후가 33배에서 **39배**가 됐다.

## 이 단계의 통과 조건

- [x] 공개 URL 에서 프론트가 붙어 1.5 의 완성 시나리오 다섯 줄이 통과한다
- [x] 스키마를 한 번 바꿔 배포했고, 마이그레이션이 자동으로 돌았다
- [x] 9.8 에서 만든 장애의 원인을 로그만 보고 찾았다

### 검증 기록 (2026-09-23)

| 무엇 | 어떻게 | 결과 |
|---|---|---|
| 공개 URL | 브라우저 → BFF → Express → Postgres | 페이지 `200` (1.1초) |
| 완성 시나리오 | 공개 URL 에서 11가지 | **11 통과 · 0 실패** |
| 마이그레이션 | `preDeploy` 로 `migrate deploy` | 4개 적용, 목록이 빈 배열 응답 |
| 내부 통신 | `server.railway.internal:4000` | BFF 가 내부 주소로 호출 성공 |
| 공개 노출 | `RAILWAY_PUBLIC_DOMAIN` 확인 | web 에만 있음 |
| 장애 연습 | `JWT_SECRET` 삭제 → 재배포 | `Deploy failed`, 로그에 원인 |
| 복구 | 변수 복원 → 자동 재배포 | 게이트 11/11 재통과 |
| 버전 정렬 | 로컬 16.15 → 18.6 | 배포와 마이너까지 일치 |
| 재측정 | 18.6 에서 7단계 전체 | 1.922 → 0.049 ms, 쿼리 2회 상수 |
| 회귀 | 3~6단계 40가지 | **40 통과 · 0 실패** |

## 남은 것

- **커스텀 도메인을 붙이지 않았다.** 플랫폼이 준 주소를 쓰고 있다. 9.7 의 "도메인을 붙이고
  인증서가 발급되는 것을 확인한다" 중 인증서 쪽은 플랫폼이 이미 해 주고 있고,
  내 도메인을 붙이는 것은 도메인을 사야 한다.
- **`CORS_ORIGIN` 이 비어 있다.** BFF 구조라 필요 없다. BFF 를 걷어내는 날 채운다.
- **관측이 로그뿐이다.** 요청 수·응답 시간 추이를 보려면 메트릭이 필요하다. 이번 범위 밖이다.
- **배포가 손으로 돈다.** `railway up` 을 직접 친다. GitHub 에 붙여 push 하면 배포되게 할 수 있고,
  그게 다음에 할 일이다.

## 아홉 단계를 마쳤다

| 단계 | 문서 |
|---|---|
| 1 주제와 도메인 | [01-domain.md](./01-domain.md) |
| 2 API 설계 | [02-api.md](./02-api.md) |
| 3 메모리 CRUD | [03-memory-crud.md](./03-memory-crud.md) |
| 4 PostgreSQL | [06-postgres.md](./06-postgres.md) |
| 5 검증과 에러 | [07-validation.md](./07-validation.md) |
| 6 인증과 권한 | [08-auth.md](./08-auth.md) |
| 7 목록 고도화 | [09-list-performance.md](./09-list-performance.md) |
| 8 프론트 연결 | [10-frontend.md](./10-frontend.md) |
| 9 배포와 운영 | [11-operations.md](./11-operations.md) · [12-deploy-prep.md](./12-deploy-prep.md) · 이 문서 |
