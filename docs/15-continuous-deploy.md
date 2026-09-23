# 15문서 — 배포 자동화

> 짝: `.github/workflows/verify.yml` 의 `deploy` job · `scripts/smoke-deployed.sh`

[14-verification.md](./14-verification.md) 에서 push 마다 검사가 돌게 했다.
여기서 **통과한 것만 자동으로 올라가게** 한다.

## 전까지 어땠나

`git push` 는 GitHub 에만 갔다. 배포는 손으로 쳤다.

```bash
railway up --service server
railway up --service web
```

문제는 잊는다는 것이 아니다. **잊은 줄 모른다는 것**이다. 로그아웃을 고치고 커밋·푸시까지
한 뒤 "배포된 사이트에는 적용이 안 된 것 같다" 는 말을 듣고서야 알았다. 배포 시각과 커밋
시각을 비교해 보니 53분 차이였다.

```
web 마지막 배포   11:32:01
로그아웃 수정     12:25:32
```

## 흐름

```
push → verify (43가지) ──통과── deploy ──▶ server ──▶ web ──▶ 스모크 5가지
                       └─실패─ 여기서 멈춘다. 아무것도 안 올라간다
```

`needs: verify` 한 줄이 그 순서를 만든다. **검사가 게이트다** — 빨간 커밋은 배포되지 않는다.

```yaml
deploy:
  needs: verify
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

PR 에서는 돌지 않는다. 검사는 PR 에서도 돌지만 배포는 `main` 에 실제로 들어온 것만 한다.

## 정한 것 넷

### 1. 서버를 먼저 올린다

마이그레이션이 서버 쪽 `preDeploy` 에 붙어 있다(→ [13-deploy.md](./13-deploy.md)).
스키마가 먼저 맞춰져야 새 웹이 기대하는 응답이 나온다. 순서를 뒤집으면 **새 웹이 옛 스키마를
보는 창**이 열린다.

### 2. 배포는 겹치지 않게 한다

```yaml
concurrency:
  group: deploy-production
  cancel-in-progress: false
```

`cancel-in-progress` 를 켜면 앞 배포가 **마이그레이션 중간에** 잘릴 수 있다. 기다리는 쪽이 맞다.

### 3. 올라간 뒤에 불러 본다

플랫폼의 헬스체크는 `/health` 가 200 인지만 본다. **컨테이너가 떴다는 뜻이지 전 구간이
이어졌다는 뜻이 아니다.** 브라우저 → BFF → Express → Postgres 중 어디가 끊겨도 `/health` 는
멀쩡하다.

`scripts/smoke-deployed.sh` 가 공개 주소를 5가지로 불러 본다.

| 확인 | 무엇을 보는가 |
|---|---|
| `GET /` | 화면이 그려진다 |
| `GET /docs` | 명세 화면이 산다 |
| `GET /docs/openapi.yaml` | 프록시가 내부 서버에 닿는다 |
| `{ posts(limit:1) }` | BFF → Express → Postgres 전 구간 |
| 토큰 없이 `createPost` | 인증이 살아 있다 — `UNAUTHENTICATED` |

**아무것도 쓰지 않는다.** `verify-deployed.sh` 와 나눈 이유가 이것이다 — 그쪽은 계정과 글을
만들고, 배포마다 돌면 운영 데이터가 검사 찌꺼기로 찬다. 스모크는 읽기만 하므로 매번 돌아도 된다.

### 4. 토큰이 없으면 실패가 아니라 건너뛴다

```yaml
if [ -z "${RAILWAY_TOKEN:-}" ]; then
  echo "has=false" >> "$GITHUB_OUTPUT"
```

레포를 복제한 사람이 남의 배포 토큰을 가질 리 없다. 그때 CI 가 빨개질 이유가 없다 —
**검사는 누구나 돌릴 수 있고 배포는 토큰을 가진 사람만 한다.**

토큰을 셸에 직접 박지 않고 `env` 로 넘긴다. `${{ secrets.X }}` 를 `run:` 안에 끼워 넣으면
값이 스크립트 본문이 되고, 값에 따옴표나 줄바꿈이 있으면 스크립트가 바뀐다.

## 토큰 넣기 — 사람이 하는 일

**나는 이 부분을 대신 할 수 없다.** 토큰을 만들고 저장소에 넣는 것은 계정 권한이 필요하다.

### 1. Railway 에서 프로젝트 토큰을 만든다

https://railway.app → `board-api` 프로젝트 → **Settings** → **Tokens** → **New Token**

- 이름: `github-actions` 처럼 어디에 쓰는지 알아볼 수 있게
- 환경: `production`

**프로젝트 토큰**이지 계정 토큰이 아니다. 계정 토큰은 그 계정의 모든 프로젝트를 만질 수 있다.
프로젝트 토큰은 이 프로젝트 하나에만 닿는다 — CI 가 털려도 피해 범위가 거기서 끝난다.

토큰 값은 **그 화면에서 한 번만 보인다.** 복사해 둔다.

### 2. GitHub 저장소 시크릿에 넣는다

터미널에서 (값을 붙여넣으라고 물어본다):

```bash
gh secret set RAILWAY_TOKEN
```

또는 웹에서 — 저장소 → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**, 이름은 `RAILWAY_TOKEN`.

### 3. 확인

```bash
gh secret list          # RAILWAY_TOKEN 이 보이면 된다
git commit --allow-empty -m "배포 자동화 확인" && git push
gh run watch
```

`deploy` job 이 건너뛰지 않고 돌면 붙은 것이다.

## 이걸로 안 되는 것

- **되돌리기가 자동이 아니다.** 스모크가 실패해도 앞 버전으로 돌아가지 않는다. 지금은 사람이
  Railway 대시보드에서 이전 배포를 다시 올린다. 자동 롤백을 붙이려면 "직전 성공 배포 id" 를
  들고 있어야 한다.
- **마이그레이션은 되돌릴 수 없다.** 컬럼을 지우는 마이그레이션이 배포되면 앞 코드로 돌아가도
  데이터는 안 돌아온다. 6단계에서 `password` → `passwordHash` 를 바꿀 때 겪은 그 성질이다.
- **스테이징이 없다.** `main` 에 들어오면 바로 운영이다. 검사 43가지가 그 앞을 지키고 있지만,
  검사가 못 보는 것은 그대로 나간다.
