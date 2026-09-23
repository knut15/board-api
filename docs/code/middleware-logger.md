# server/src/middleware/logger.ts

> 커리큘럼 3.3 · 9.5 · 짝: `server/src/middleware/logger.ts`

## 무엇을 하는 파일인가

요청 하나에 id 를 붙이고, 그 요청이 끝날 때 한 줄을 남긴다.
`app.use(requestLogger)` 가 `app.ts` 의 첫 줄인 이유가 여기 있다 — 뒤에서 무슨 일이 나든 요청이 들어온
사실은 남고 id 도 그때 붙는다. **무엇을 어떻게 찍을지**(레벨·마스킹)는 `logger.md`, 단계 전체는
[11-operations.md](../11-operations.md) 9.5 가 맡는다.

## 코드를 따라 읽기

### 미들웨어는 인자 3개를 받는 함수다

```ts
export function requestLogger(req: Request, res: Response, next: NextFunction) {
```

이 서명이 곧 Express 와의 계약이다. 인자가 3개면 일반 미들웨어, 4개(`err, req, res, next`)면 에러 핸들러로
알아본다 — `app.ts` 7번 블록이 인자 4개인 것이 그 때문이다.

### 요청 id 는 받은 것이 있으면 그것을 쓴다

```ts
  req.id = req.header("x-request-id") ?? crypto.randomUUID();
  req.log = logger.child({ reqId: req.id });
  res.setHeader("x-request-id", req.id);
```

세 줄이 각각 다른 일을 한다.

- **받은 것을 우선한다.** 프록시나 로드 밸런서가 이미 id 를 붙였다면 그 값을 쓴다. 그래야 양쪽 로그가
  같은 id 로 이어진다. 없을 때만 만든다.
- **자식 로거를 요청에 붙인다.** `req.log` 로 찍는 모든 줄에 `reqId` 가 자동으로 붙는다. 핸들러가 id 를
  들고 다니며 매번 넣을 필요가 없고, `errorHandler` 도 `req.log.error` 를 쓴다(`error-handler.md`).
- **응답 헤더로 돌려준다.** 사용자가 "이 요청이 실패했다" 고 신고할 때 댈 번호가 생긴다.

`req.id` 와 `req.log` 는 `Request` 에 원래 없는 속성이라 파일 위에서 타입을 넓힌다.

```ts
declare global {
  namespace Express {
    interface Request {
      id: string;
      log: typeof logger;
    }
  }
}
```

`currentUser` 가 `req.user` 를 붙일 때와 같은 방법이다(`middleware-current-user.md`).

### 로그는 응답이 끝난 뒤에 찍는다

```ts
  const startedAt = performance.now();

  res.on("finish", () => {
    req.log.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        ms: Number((performance.now() - startedAt).toFixed(1)),
      },
      "request",
    );
  });
```

**상태 코드와 소요 시간은 응답이 끝나야 정해지는 값이다.** 진입 시점의 `res.statusCode` 는 아직 기본값
200 이고 걸린 시간은 존재하지도 않는다. 로거가 가장 먼저 실행되지만 출력은 가장 나중에 나오는 것이 정상이다.

`finish` 는 헤더와 바디를 전부 내보냈을 때 나는 이벤트다. `req`/`res` 는 Node 의 스트림이라 `.on()` 이 붙는다.
`toFixed(1)` 이 문자열을 만들므로 `Number(...)` 로 되돌리는 것에 주의한다 — JSON 에서 `"4.3"` 과 `4.3` 은
다르고, 문자열이면 로그 검색에서 `ms > 100` 같은 조건을 걸 수 없다.

```json
{"level":30,"time":1790061453097,"reqId":"dd5ce7c6-…","method":"GET","url":"/health","status":200,"ms":4.3,"msg":"request"}
```

### `next()` 를 부르지 않으면 요청이 멈춘다

이 한 줄을 지우면 요청은 라우터까지 가지 못하고, 응답을 아무도 만들지 않으므로 클라이언트는 그냥 기다린다.
에러도 404 도 안 난다 — **조용히 멈춘다.** 미들웨어를 쌓는다는 것은 `next()` 로 이어진 줄에 함수를 끼우는 일이다.

## 왜 이렇게 했는가

- **직접 짜기 vs `pino-http`.** pino 쪽에도 요청 로깅 미들웨어가 따로 있다. 쓰면 이 파일이 몇 줄로 줄지만
  `(req, res, next)` 와 `next()` 가 무엇인지 보지 못하고 지나간다. 3단계에서 보려고 직접 짰고 9.5 에서도
  갈아 끼우지 않았다 — **찍는 도구만 바꾸고 흐름은 그대로 둔 것**이 이 파일의 이력이다.
- **한 줄 텍스트 vs JSON.** 3단계에는 `console.log` 로 `GET /posts 200 4.3ms` 를 찍었다. 사람이 터미널에서
  읽기에는 그쪽이 낫고, 기계가 검색·집계하려면 JSON 이어야 한다. 9.5 에서 반대편으로 갔다.
- **`finish` vs `close`.** `finish` 는 정상 완료, `close` 는 중간에 끊긴 경우까지 포함한다. 끊긴 요청까지
  세려면 `close` 가 필요하지만, 지금 알고 싶은 것은 "응답이 어떻게 나갔나" 라서 `finish` 만 듣는다.
- **id 를 만들기 전에 받아 보는 것.** 항상 새로 만들면 앞단 프록시의 로그와 우리 로그가 다른 번호를 갖고, 정작 장애가 났을 때 둘을 이을 방법이 없어진다.

## 9단계에서 무엇이 바뀌었나

`console.log` 한 줄이 pino 로 바뀌면서 셋이 붙었다.

- **요청 id.** `x-request-id` 가 오면 그 값, 없으면 `crypto.randomUUID()`. 응답 헤더로도 돌려준다.
- **`req.log`.** 요청 단위 자식 로거. `errorHandler` 도 이것으로 찍는다.
- **JSON 한 줄.** `method`·`url`·`status`·`ms` 가 각각 필드다.

`(req, res, next)` 서명과 `next()` 규칙, `res.on("finish")` 자리는 그대로다 — 3단계에 배운 것이 그대로 남았다.
함수 이름이 `logger` 에서 `requestLogger` 가 된 것은 `logger.ts` 가 내보내는 `logger` 와 겹쳐서다.
회귀 **40 통과 · 0 실패**, `tsc`·`eslint` 오류 0.

이 한 줄이 9.6 의 종료 처리를 증명한 근거다. 동시 40요청에 `SIGTERM` 을 보냈을 때
`ms: 140.4` 짜리 요청이 **신호 이후에** `status: 200` 으로 이 로그를 남겼고, 그다음 줄이 `closed` 였다.
로그에 소요 시간을 넣어 두지 않았으면 "끊기지 않았다" 를 말로만 주장하게 된다.
자세한 것은 `11-operations.md` 9.6 에 있다.

## 직접 해 볼 것

1. `curl -i localhost:4000/health` → 응답 헤더에 `x-request-id` 가 있고, 같은 값이 로그 줄의 `reqId` 다.
   이어서 `curl -H 'x-request-id: my-id-1' …` 를 보내면 로그의 `reqId` 가 `my-id-1` 이 된다.
2. `next()` 를 주석 처리하고 아무 엔드포인트나 부른다 → `curl` 이 응답 없이 멈추고 **로그도 안 찍힌다.**
   `finish` 가 나지 않으니 찍을 자리도 오지 않는다는 것이 요점이다. 되돌린다.
3. `res.on("finish", …)` 를 벗겨 `req.log.info` 를 `next()` 앞으로 옮긴다 → `status` 가 실제 응답과
   무관하게 늘 `200` 이고 `ms` 는 0 에 가깝다. 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 9.5 | **끝났다.** `console.log` 가 pino 가 되고 요청 id 가 붙었다 |
| 9.1 | **끝났다.** 레벨이 검증된 `env` 에서 온다(`logger.md`) |
| 9.6 | **끝났다.** 종료 처리가 붙었고 이 미들웨어는 손대지 않았다 |
| 9.3 | 플랫폼 프록시가 `x-request-id` 를 먼저 붙여 줄 수 있다. 그때 `??` 의 왼쪽이 쓰인다 |
| 9.4 | 마이그레이션 로그는 이 줄들과 형식이 다르다. 같은 스트림에 섞인다는 것만 알아 둔다 |
| 9.7 | HTTPS 종단이 앞단으로 가면 클라이언트의 원래 주소는 프록시 헤더로만 온다 |
| 9.8 | 장애를 일부러 내고 `reqId` 로 한 요청의 줄을 모아 본다 |
