# 14문서 — 검사 스크립트

> 짝: `scripts/`

## 왜 레포에 넣었나

3단계부터 9단계까지 매번 셸 스크립트로 검사했다. 그런데 그 스크립트들이 임시 디렉터리에만
있었다. **작업이 끝나면 사라지는 검사는 회귀 검사가 아니다** — 다음에 코드를 고치는 사람은
같은 것을 처음부터 다시 쓴다.

지금은 넷이다.

| 스크립트 | 무엇을 | 몇 개 | DB 를 비우나 |
|---|---|---|---|
| `verify-validation.sh` | 3~5단계 — 상태 코드·에러 형태·내부 유출 | 16 | 아니오 |
| `verify-auth.sh` | 6단계 + 로그아웃 — 인증·권한·해시·토큰 | 27 | **예** |
| `verify-deployed.sh` | 9.7 — 배포된 공개 URL 의 완성 시나리오 | 12 | 아니오 |
| `bench.sh` | 7단계 — 목록 응답 시간 | — | 아니오 |

`verify.sh` 는 앞의 둘을 잇달아 돌린다. **43가지**다.

```bash
./scripts/verify.sh              # 로컬 회귀 전체
./scripts/verify-deployed.sh     # 배포본
./scripts/bench.sh               # 측정
```

`pnpm verify` · `pnpm verify:deployed` · `pnpm bench` 로도 같다.

## 규칙 하나 — 측정 중에는 회귀를 돌리지 않는다

`verify-auth.sh` 는 시작할 때 `TRUNCATE users, posts, comments CASCADE` 를 한다.
해시가 계정마다 다른지(salt), 페이로드에 무엇이 들어 있는지를 세려면 아는 데이터만 있어야 한다.

**7단계 시드(글 1만 건)를 넣어 둔 상태에서 돌리면 전부 사라진다.** 이 레포에서 두 번 겪었다.
두 번째에는 "성능이 갑자기 좋아졌다" 고 착각할 뻔했다 — 빈 테이블은 무엇을 재도 빠르다.

되돌리는 법은 한 줄이다.

```bash
cd server && pnpm exec tsx prisma/7.1-seed.ts
```

`VACUUM ANALYZE posts` 도 한 번 돌린다. 갓 넣은 데이터는 가시성 맵이 비어 있어
`Index Only Scan` 의 `Heap Fetches` 가 0 이 아니다(→ [11-operations.md](./11-operations.md)).

## 안전 장치 — 운영 DB 를 비우지 못하게

```bash
require_local() {
  case "$API" in
    http://localhost:*|http://127.0.0.1:*) ;;
    *) echo "이 검사는 DB 를 비운다. 로컬이 아닌 주소에서는 돌리지 않는다 — $API" >&2; exit 2 ;;
  esac
}
```

`BOARD_API_URL` 로 대상을 바꿀 수 있게 했기 때문에 필요하다. 바꿀 수 있는 것은
**틀리게 바꿀 수도 있다**는 뜻이고, 이 스크립트가 틀리는 방향은 한 가지뿐이라 막을 수 있다.

## `lib.sh` 에서 실제로 났던 버그

값을 꺼내는 `pick` 이 이렇게 돼 있었다.

```js
console.log(eval("(" + d + ")").token)
```

로그인이 **실패하면** `.token` 이 `undefined` 고, `console.log` 는 `undefined` 라는 **다섯 글자
문자열**을 찍는다. 받는 쪽은 그것을 "토큰을 받았다" 로 읽는다.

레포에 옮긴 첫 실행에서 16개 중 8개가 실패했다. 서버는 멀쩡했다 — 계정이 없는 DB 에서
로그인이 실패했고, `Authorization: Bearer undefined` 로 나머지 요청을 보낸 것이다.

```js
const v = eval("(" + d + ")").token; console.log(v ?? "")
```

**비어 있음을 비어 있음으로 표현하지 않는 코드**가 어떻게 무너지는지 보여 주는 예다.
검사 스크립트의 버그는 코드의 버그처럼 보인다 — 이 레포에서 세 번째다.

## 돌리기 전에 필요한 것

| 스크립트 | 필요한 것 |
|---|---|
| `verify-validation.sh` | Express 가 `:4000` 에 떠 있다 (`pnpm dev:server`) |
| `verify-auth.sh` | 위 + Postgres 컨테이너 (`cd server && pnpm db:up`) |
| `verify-deployed.sh` | 인터넷. 배포본 주소는 인자나 `BOARD_SITE_URL` 로 바꾼다 |
| `bench.sh` | 위 + 시드 1만 건 |

`psql` 을 노트북에 설치하지 않아도 된다. 컨테이너 안의 것을 쓴다.

```bash
PSQL="docker-compose -f server/compose.yaml exec -T db psql -U board -d board -tAc"
```

## 종료 코드

실패가 하나라도 있으면 `1` 로 끝난다. 사람 눈으로 읽는 표 말고도 기계가 읽을 신호가 필요해서다 —
GitHub Actions 를 붙이는 날 이 스크립트를 그대로 부르면 된다.

```bash
./scripts/verify.sh && echo "올려도 된다"
```

## CI — push 마다 돈다

`.github/workflows/verify.yml` 이 `main` 으로 가는 push 와 모든 PR 에서 돈다.

```
타입 검사 → 린트 → 마이그레이션 → 서버 띄우기 → 검사 43가지 → 웹 빌드
```

**CI 전용 검사를 따로 만들지 않았다.** 로컬에서 부르는 `./scripts/verify.sh` 를 그대로 부른다.
둘로 나누면 갈라지고, 갈라진 쪽은 아무도 안 고친다.

### 러너에 맞춘 것 셋

**DB 는 서비스 컨테이너다.** `compose.yaml` 과 같은 `postgres:18.6-alpine` 이다. 버전을 맞추는
이유는 "로컬에서는 되는데" 를 없애려는 것이고, 이 레포는 그걸 이미 세 번 겪었다.
러너에는 compose 의 `healthcheck` 가 없어서 같은 일을 `options` 에 적었다 — 없으면 다음 단계가
아직 안 뜬 DB 에 붙으러 간다.

**`PSQL` 을 갈아 끼운다.** `lib.sh` 의 기본값은 컨테이너 안의 psql 을 부르는데 러너에는 compose 가
없다. 환경변수 하나로 러너에 깔린 psql 을 가리킨다.

```yaml
PSQL: psql postgresql://board:board@localhost:5432/board -tAc
```

바꿀 수 있게 만들어 둔 것이 여기서 값을 했다. 스크립트는 한 줄도 안 고쳤다.

**서버가 뜰 때까지 기다린다.** `sleep 10` 으로 어림잡으면 느린 날 실패하고 빠른 날 낭비한다.
`/health` 를 1초 간격으로 찔러 본다 — 로컬에서 재 보니 2초에 떴다.

### 실패하면 로그를 뱉는다

```yaml
- name: 서버 로그 (실패했을 때만)
  if: failure()
  run: cat /tmp/server.log
```

9.8 에서 배운 것이다. 그때 배포가 실패했는데 `railway logs` 가 **엉뚱한 배포**를 보여 줘서 한참을
헤맸다. 실패한 실행의 로그를 손 닿는 곳에 두지 않으면 원인을 못 찾는다.

`JWT_SECRET` 이 빠지면 `env.ts` 가 어느 값이 왜 틀렸는지 한 줄씩 찍고 죽는다(9.1). 그 줄이
이 단계로 올라온다.

### 비밀이 아닌 비밀

```yaml
JWT_SECRET: ci-only-secret-0123456789abcdef0123456789abcdef
```

코드에 그대로 적혀 있다. **검사용이라 감출 것이 없다.** 32자 이상이어야 `env.ts` 의 검증을
통과하므로 길이만 맞췄다. 운영 값은 Railway 가 `ctx.randomString()` 으로 만들어 들고 있고
레포에는 없다(→ [13-deploy.md](./13-deploy.md)).

### CI 가 돌리지 않는 것

**`verify-deployed.sh` 는 CI 에서 돌리지 않는다.** 그 검사는 운영 DB 에 계정과 글을 만든다.
push 마다 돌면 운영 데이터가 검사 찌꺼기로 채워진다. 배포한 뒤 사람이 부른다.

**`bench.sh` 도 돌리지 않는다.** 러너의 성능은 실행마다 다르다. 거기서 잰 밀리초는 비교할 수 없다.

## 아직 안 한 것

- **단위 테스트가 없다.** 전부 HTTP 를 통과하는 검사다. 빠르지는 않지만(43가지에 수십 초)
  "계약이 지켜지는가" 를 보는 데는 이쪽이 맞다.
- **배포는 여전히 손으로 한다.** 검사가 통과하면 자동으로 `railway up` 까지 가는 것이 다음이다.
