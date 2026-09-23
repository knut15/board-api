# server/src/routes/docs.ts

> 커리큘럼 2.6 · 짝: `server/src/routes/docs.ts`

## 무엇을 하는 파일인가

`openapi.yaml` 을 **주소로 만든다.** `GET /docs` 는 Swagger UI 화면을, `GET /docs/openapi.yaml` 은
명세 원문을 준다. 프론트엔드 개발자가 레포를 받지 않고도 계약을 읽을 수 있게 하는 것이 목적이다.

## 코드를 따라 읽기

경로 둘뿐이다.

```ts
docsRouter.get("/openapi.yaml", (_req, res) => {
  res.type("text/yaml; charset=utf-8").send(readFileSync(SPEC, "utf8"));
});

docsRouter.get("/", (_req, res) => {
  res.type("text/html; charset=utf-8").send(`… SwaggerUIBundle({ url: "/docs/openapi.yaml" }) …`);
});
```

**Swagger UI 를 의존성으로 받지 않는다.** `swagger-ui-express` 를 넣으면 정적 파일 수 메가바이트가
이미지에 따라붙는다. 이 화면은 서버가 하는 일이 아니라 서버를 **설명하는** 것이라 CDN 에서 가져온다.
대신 버전을 못 박았다 — `latest` 로 두면 CDN 쪽이 바뀌는 날 화면이 같이 바뀌고, 그때 무엇이 바뀐
건지 레포 안에는 아무 기록이 없다.

```ts
const SWAGGER_UI = "5.33.0";
```

**스펙 주소를 절대 경로로 적는다.**

```js
url: "/docs/openapi.yaml",
```

`"openapi.yaml"` 이라고 쓰면 브라우저가 현재 주소를 기준으로 푼다. `/docs` 에는 끝 슬래시가 없어서
`/openapi.yaml` 이 되고 `404` 다. 상대 경로가 맞으려면 주소가 `/docs/` 여야 하는데, 사람이 주소창에
치는 것은 `/docs` 다.

**파일을 요청마다 읽는다.** 시작할 때 한 번 읽어 두면 빠르지만, 명세를 고치고 새로고침했을 때 옛
내용이 나온다. 이 경로에서는 그게 더 비싸다 — 여기를 보는 이유가 "지금 계약이 무엇인가" 라서다.

**파일이 없으면 500 이다.**

```ts
throw new AppError(500, "INTERNAL_ERROR", `명세 파일(${SPEC})이 실행 디렉터리에 없습니다.`);
```

새 에러 코드를 만들지 않았다. 이건 요청이 잘못된 게 아니라 **이미지가 잘못 만들어진** 것이다.
`Dockerfile` 이 `openapi.yaml` 을 복사하지 않으면 여기서 걸린다 — Prisma 생성물이 `pnpm deploy` 를
타고 따라오지 않아 컨테이너가 죽었던 것과 같은 종류다(`docs/12-deploy-prep.md`).

```dockerfile
COPY --from=build /app/server/openapi.yaml ./openapi.yaml
```

## 왜 이렇게 했는가

1. **인증을 걸지 않았다.** 계약은 부르기 전에 읽는 것이다. `/docs` 에 로그인을 요구하면 계약을
   읽으려고 계약을 알아야 하는 순환이 생긴다. 명세에는 비밀이 없다 — 엔드포인트 이름과 스키마뿐이고,
   그것을 감추는 것은 보안이 아니라 불편이다.
2. **`app.ts` 에서 `/auth` 보다 먼저 등록한다.** 순서에 의존하지는 않는다(접두사가 겹치지 않는다).
   맨 위에 둔 것은 읽는 사람에게 "여기부터 보라" 고 말하기 위해서다.
3. **`servers` 에 배포 주소를 적지 않았다.** 적으면 Swagger UI 의 "Try it out" 이 운영 DB 에 글을
   쓴다. 지금 목록에는 `http://localhost:4000` 하나뿐이고, 눌러 보는 것은 로컬에서만 된다.

## 직접 해 볼 것

1. `SWAGGER_UI` 를 없는 버전(`"9.9.9"`)으로 바꾸고 `/docs` 를 연다 → 화면이 **빈 페이지**다.
   CSS·JS 가 `404` 인데 HTML 은 `200` 이라 서버 로그에는 아무것도 안 남는다. 브라우저 콘솔을 봐야
   보인다 — CDN 에 기대면 실패가 서버 밖에서 일어난다는 뜻이다.
2. `url` 을 `"openapi.yaml"` 로 되돌리고 `/docs` 를 연다 → Swagger UI 가 "Failed to load API
   definition" 을 띄운다. 그다음 주소창에 `/docs/` 를 슬래시까지 붙여 치면 이번에는 뜬다.
3. `server/openapi.yaml` 의 `summary` 하나를 고치고 **서버를 재시작하지 않은 채** 새로고침한다 →
   바뀐 값이 바로 보인다. 요청마다 읽기 때문이다.

## 다음 단계에서 어떻게 바뀌는가

배포된 서버에는 공개 도메인이 없어서 지금 `/docs` 는 **로컬에서만 보인다.** 프론트엔드 개발자에게
주소를 주려면 둘 중 하나다 — `server` 에 공개 도메인을 붙이거나(API 전체가 같이 공개된다),
Next 가 `/docs` 를 대신 받아 넘기거나(서버는 계속 내부에만 남는다). 9.3 에서 "밖에 나가는 것은
web 하나" 로 정했으므로 뒤쪽이 그 결정과 맞는다.
