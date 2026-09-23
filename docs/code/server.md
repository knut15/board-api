# server/src/server.ts

> 커리큘럼 3.1 · 3.2 · 9.1 · 9.6 · 짝: `server/src/server.ts`

## 무엇을 하는 파일인가

프로세스가 뜰 때 한 번 하는 일과 내려갈 때 한 번 하는 일을 담는다 — 포트를 열고 듣기 시작하는 것,
종료 신호를 받아 정리하는 것. 요청을 어떻게 처리할지는 한 줄도 없다. 그것은 `app.ts` 의 몫이다.
배포 쪽 맥락은 [11-operations.md](../11-operations.md) 9.6 에 있다.

## 코드를 따라 읽기

### 듣기 시작한다

```ts
const server = createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "listening");
});
```

`createApp()` 은 `app.ts` 가 내보내는 함수다. **`app` 값을 바로 내보내지 않고 함수로 감싼 것**이 3.2 의
핵심이다. 호출해야 미들웨어가 쌓인 `app` 이 하나 만들어지고, 호출하지 않으면 아무것도 만들어지지 않는다 —
테스트는 `createApp()` 만 가져다 요청을 흉내 내고 포트는 건드리지 않는다.

`listen` 이 실제로 OS 에 포트를 요청하는 줄이다. 이 줄이 없으면 프로세스는 할 일을 다 하고 그냥 끝난다.
반환값을 `server` 에 담아 두는 것이 9.6 에서 쓰인다 — 닫으려면 붙잡고 있어야 한다.

`env.PORT` 는 `env.ts` 가 1–65535 정수로 검증한 **숫자**다(`env.md`). `Number(process.env.PORT ?? 4000)`
이었을 때는 `PORT=abc` 가 `NaN` 이 되어도 아무도 알려 주지 않았다.

### 신호를 두 번 받아도 한 번만 내려간다

```ts
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
```

`Ctrl+C` 를 두 번 누르는 것은 흔한 일이고, 플랫폼도 `SIGTERM` 뒤에 다른 신호를 보낼 수 있다.
깃발 하나가 `server.close` 가 두 번 불리는 것을 막는다. `SIGTERM`·`SIGINT` 둘 다 같은 함수로 들어간다.

### 세 가지를 순서대로 한다

```ts
  server.close(async (err) => {
    if (err) logger.error({ err }, "error while closing server");
    await prisma.$disconnect();
    logger.info("closed");
    process.exit(err ? 1 : 0);
  });
```

`server.close()` 는 **리스너를 먼저 닫고**(새 요청 거부) **진행 중인 요청이 끝나기를 기다린 뒤** 콜백을 부른다.
그래서 DB 연결을 끊는 `$disconnect()` 가 콜백 안에 있다 — 먼저 끊으면 처리 중이던 요청이 DB 없이 남는다.
`closed` 가 마지막 로그이고 그 뒤에 포트가 반환된다.

### 기다려 주지 않는 쪽도 대비한다

```ts
  const forceExit = setTimeout(() => {
    logger.error("graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();
```

10초 안에 못 끝내면 그냥 나간다. 영영 안 닫히는 연결 하나 때문에 배포가 멈추는 것이 더 나쁘다.
`unref()` 는 **이 타이머 때문에 이벤트 루프가 살아 있지는 않게** 한다는 뜻이다. 지금은 `close` 콜백이
`process.exit` 으로 끝내므로 차이가 드러나는 경우가 드물지만, `process.exit` 을 빼고 자연 종료에 맡기는
모양으로 바꾸는 순간 이 한 줄이 "다 닫혔는데 10초를 더 사는" 것을 막는다.

## 왜 이렇게 했는가

1. **app 생성과 listen 을 나눈 것.** 한 파일에서 `express()` 를 만들고 바로 `listen` 하면 그 파일을
   import 하는 것만으로 포트가 열린다. 테스트 두 개를 동시에 돌리면 같은 포트를 두고 부딪힌다.
   대가는 파일이 둘로 늘어 읽는 사람이 둘을 따라가야 한다는 것이고, 엔드포인트 11개에서도 값을 하는 교환이다.
2. **종료 처리를 `app.ts` 가 아니라 여기 둔 것.** `app.ts` 는 요청 하나의 일만 안다. 프로세스의 수명은
   프로세스를 띄운 파일이 맡는 편이 경계가 맞고, `createApp()` 만 쓰는 테스트에 신호 처리가 딸려 오지 않는다.
3. **강제 종료를 10초로 잡은 것.** 플랫폼은 `SIGTERM` 뒤 일정 시간을 기다렸다가 강제로 죽인다.
   그 시간보다 우리 쪽이 짧아야 마지막 로그를 남길 수 있다. 플랫폼을 정하면 실제 대기 시간을 보고 맞춘다(9.3).

## 9단계에서 무엇이 바뀌었나

"12줄" 이라고 적어 두었던 파일이 47줄이 됐다. 바뀐 것은 셋이다.

- **`process.env.PORT` → `env.PORT`** (9.1). `Number(...)` 와 `?? 4000` 이 사라졌다 — 기본값도 형식 검사도
  `env.ts` 가 한다. 틀린 포트는 이 파일에 오기 전에 걸린다.
- **`console.log` → `logger.info`** (9.5). 기동 로그가 `port`·`env` 를 필드로 가진 JSON 한 줄이다.
- **`SIGTERM`·`SIGINT` 종료 처리** (9.6). 파일 길이의 대부분이 이것이다.

동시 요청 40개를 쏘고 곧바로 `SIGTERM` 을 보내 재 봤다.

| | 결과 |
|---|---|
| 이미 처리 중이던 요청 | **3건이 신호 이후에 200 으로 끝났다** (41.9 · 41.2 · **140.4** ms) |
| 그 뒤 | `closed` 로그 → 프로세스 종료 → 포트 반환 |
| 아직 연결되지 않은 37건 | 거부 |

140.4ms 짜리가 증거다. 신호를 받은 뒤에도 하던 일을 끝냈다. 빌드 분리(9.2)도 이 파일이 종점이라
`pnpm build` 로 `dist` 에 JS **21개**를 만들고 `node dist/server.js` 로 띄워 `/health` 200 을 확인했다 —
tsx 없이 돈다. 회귀 **40 통과 · 0 실패**, `tsc`·`eslint` 오류 0.

## 직접 해 볼 것

1. `PORT=5001 pnpm dev` 로 띄운다 → `curl localhost:5001/health` 는 답하고 4000 은 연결되지 않는다.
   이어서 `PORT=abc` 로 띄우면 이제는 **서버가 아예 뜨지 않는다.** 9.1 전에는 `NaN` 이 조용히 지나갔다.
2. 2초 걸리는 엔드포인트를 하나 만들어 부른 직후 다른 터미널에서 `kill -TERM <pid>` 를 보낸다 →
   그 요청은 200 으로 끝나고, 그 뒤에 온 요청은 연결되지 않으며, 마지막에 `closed` 가 찍힌다.
3. `server.close` 콜백의 `process.exit(...)` 를 지우고 종료해 본다 → `unref()` 가 있어 곧 끝난다.
   `unref()` 까지 지우면 10초를 채우고 `forcing exit` 로 끝난다. 두 줄 다 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 9.1 | **끝났다.** `env.PORT` 를 쓴다 |
| 9.5 | **끝났다.** 기동·종료 로그가 pino 다 |
| 9.6 | **끝났다 — 코드는.** 종료 처리가 붙었다. `/health` 를 플랫폼 헬스체크에 무는 일만 남았다 |
| 9.3 | 플랫폼이 `PORT` 를 주입하고 릴리스 커맨드가 `node dist/server.js` 를 부른다. 이 파일은 그대로다 |
| 9.4 | 릴리스 커맨드 앞에 `prisma migrate deploy` 가 붙는다. 이 파일은 그대로다 |
| 9.7 | 도메인과 HTTPS 는 앞단 프록시가 맡는다. 여기는 평문 HTTP 를 그대로 듣는다 |
| 9.8 | 장애를 일부러 내고 종료·재기동이 로그에 어떻게 보이는지 본다 |
