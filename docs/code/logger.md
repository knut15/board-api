# server/src/logger.ts

> 커리큘럼 9.5 · 짝: `server/src/logger.ts`

## 무엇을 하는 파일인가

pino 인스턴스를 하나 만들어 내보낸다. 정하는 것은 레벨과 마스킹 규칙 둘뿐이고 요청도 응답도 여기 없다.
요청 하나에 무슨 일이 일어나는가는 `middleware-logger.md` 가 맡고, 이 파일은 **무엇을 어떻게 찍을지**만 정한다.
단계 전체의 맥락은 [11-operations.md](../11-operations.md) 9.5 에 있다.

## 코드를 따라 읽기

### 레벨은 검증된 값으로 들어온다

```ts
export const logger = pino({
  level: env.LOG_LEVEL,
```

`process.env.LOG_LEVEL` 이 아니라 `env` 를 읽는다. 여섯 단계 중 하나인지는 `env.ts` 가 이미 봤으므로
(`env.md`) 여기서 오타를 다시 걱정하지 않는다. 기본이 `info` 라 `debug` 로 찍은 줄은 운영에 나오지 않고,
플랫폼에서 `LOG_LEVEL` 만 바꿔 다시 올리면 상세 로그가 켜진다 — **코드를 고치지 않고 켜고 끈다.**

포맷 옵션이 한 줄도 없는 것에 주의한다. pino 는 JSON 한 줄이 기본이라 따로 정할 것이 없다.

### redact 는 찍는 사람을 믿지 않는다

```ts
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "body.password",
      "*.password",
      "*.passwordHash",
      "*.token",
    ],
    censor: "[Redacted]",
  },
```

경로를 한 번 정해 두면 **어느 핸들러가 무엇을 찍든** 그 자리는 `[Redacted]` 로 나간다.
"로그에 비밀번호를 찍지 말자" 는 사람이 지키는 규칙이고, 이것은 로거가 지키는 규칙이다 —
새 핸들러를 쓰는 사람이 규칙을 몰라도 값이 새지 않는다.

앞의 셋은 정확한 경로이고 `*.password` 부터는 한 겹 아래를 훑는 패턴이다. 객체를 통째로 넘겨
`{ user: { passwordHash } }` 가 되는 자리를 잡으려는 것이다. 민감한 값 5개를 직접 찍어 확인했고
전부 마스킹됐다 — 원문 노출 **0건**이다.

마스킹은 **찍는 시점**에 걸린다. 값 자체는 메모리에 그대로 있고 로그로 나가는 쪽만 바뀐다.

## 왜 이렇게 했는가

1. **JSON 한 줄.** 사람이 터미널에서 읽기에는 텍스트가 낫다. 배포한 뒤에 읽는 쪽은 사람이 아니라
   플랫폼의 로그 검색이고, 그쪽은 줄 단위 문자열이 아니라 **필드**를 건다. `status >= 400` 으로 거르거나
   `reqId` 로 한 요청을 묶는 일이 텍스트 로그에서는 정규식 문제가 된다.
2. **`pino-pretty` 를 넣지 않은 것.** 개발에서만 꾸미면 읽기는 편해지지만 개발과 운영이 다른 모양이 된다.
   같은 모양으로 두는 편이 "로그에 이 필드가 없네" 를 배포 전에 알아차리게 한다. 대가는 개발 중 가독성이고,
   필요하면 `node dist/server.js | pnpm dlx pino-pretty` 처럼 **파이프로** 붙일 수 있다 — 코드는 그대로다.
3. **모듈 하나가 로거를 들고 있는 것.** `createApp()` 이 로거를 받아 내려보내는 방법도 있다. 테스트에서
   갈아 끼우기는 그쪽이 낫지만, 지금은 미들웨어·에러 핸들러·`server.ts` 가 import 한 줄로 같은 것을 쓰는 편이
   짧다. 요청 단위 맥락은 주입이 아니라 `logger.child()` 로 붙인다.

## 9단계에서 무엇이 바뀌었나

**이 파일이 9.5 에서 생겼다.** 그 전까지 로그를 만드는 곳은 `middleware/logger.ts` 의 `console.log` 한 줄뿐이었다.
pino 10.3.1 이 `dependencies` 에 들어갔고 로깅 의존성은 그것 하나다.

이 파일이 생기면서 찍는 자리가 셋으로 늘었다.

- `middleware/logger.ts` — 요청 한 줄이 JSON 이 되고 `reqId` 가 붙었다
- `middleware/errorHandler.ts` — `req.log.error({ err }, "unhandled error")`
- `server.ts` — 기동·종료 로그가 `logger.info` 다

한 줄의 모양은 이렇다.

```json
{"level":30,"time":1790061453097,"reqId":"dd5ce7c6-…","method":"GET","url":"/health","status":200,"ms":4.3,"msg":"request"}
```

검증은 마스킹 5개 전부 `[Redacted]`(원문 노출 0건), 회귀 **40 통과 · 0 실패**, `tsc`·`eslint` 오류 0 이다.

## 직접 해 볼 것

1. 아무 핸들러에 `req.log.info({ user: { password: "hunter2" } }, "probe")` 를 한 줄 넣고 부른다 →
   `[Redacted]` 다. `paths` 에서 `"*.password"` 만 지우고 다시 부르면 원문이 찍힌다. 둘 다 되돌린다.
2. `LOG_LEVEL=error` 로 띄우고 `/health` 를 부른다 → 요청 한 줄(`level:30`)이 나오지 않는다.
   로그가 안 보이는 이유가 코드가 아니라 설정일 수 있다는 것을 한 번 겪어 둔다.
3. `pnpm build` 뒤 `node dist/server.js | jq 'select(.status >= 400)'` 로 띄우고 없는 경로를 부른다 →
   404 줄만 걸러진다. 필드를 건다는 것이 무엇인지 한 줄로 보인다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 9.1 | **끝났다.** `LOG_LEVEL` 이 검증된 `env` 에서 온다 |
| 9.5 | **끝났다.** 이 파일이 생겼다 |
| 9.6 | **끝났다.** 기동·종료 로그가 이 로거로 왔다 |
| 9.3 | 플랫폼의 로그 수집에 stdout 을 물린다. JSON 한 줄이면 대개 설정이 따로 없다 |
| 9.4 | 마이그레이션이 릴리스에서 도는 만큼 그 출력도 같은 곳에 쌓인다. 형식이 다르다는 것을 알고 본다 |
| 9.7 | 도메인과 HTTPS 가 붙으면 프록시가 요청 로그를 따로 남긴다. 둘을 `reqId` 로 잇는다 |
| 9.8 | 장애를 일부러 내고 로그만으로 원인을 찾는다. `reqId` 와 `redact` 가 그때 시험받는다 |
