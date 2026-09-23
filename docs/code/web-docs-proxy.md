# web/src/app/docs/

> 커리큘럼 2.6 · 9.3 · 짝: `web/src/app/docs/proxy.ts` · `route.ts` · `openapi.yaml/route.ts`

## 무엇을 하는 파일인가

명세 화면(`GET /docs`)을 **공개 주소에 얹는다.** Express 는 배포 환경에서 공개 도메인 없이 돌기
때문에(9.3 — 밖에 나가는 것은 `web` 하나다) `/docs` 도 밖에서는 안 보였다. Next 가 그 요청을
대신 받아 내부 주소로 넘긴다.

## 코드를 따라 읽기

파일 셋인데 하는 일은 하나다.

```
web/src/app/docs/
  proxy.ts                  통로 하나
  route.ts                  GET /docs
  openapi.yaml/route.ts     GET /docs/openapi.yaml
```

```ts
const BASE = process.env.BOARD_API_URL ?? "http://localhost:4000";

export async function proxyDocs(path: string): Promise<Response> {
  const upstream = await fetch(`${BASE}${path}`, { cache: "no-store" });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
    },
  });
}
```

**화면을 여기서 새로 만들지 않는다.** HTML 도 명세도 Express 가 들고 있다(→ `routes-docs.md`).
Next 가 Swagger UI 를 따로 그리면 두 곳이 각자 배포되고, 배포 시점이 어긋나는 날 **서로 다른
계약**을 보여 준다. 통로는 어긋날 수 없다.

**`Content-Type` 을 그대로 옮긴다.** 이 함수 하나가 HTML 과 YAML 을 둘 다 나른다. 여기서 타입을
고정하면 한쪽이 틀린 채로 나가고, Swagger UI 는 YAML 이 `text/html` 로 오면 파싱을 포기한다.

**디렉터리 이름에 점이 들어 있다.**

```
openapi.yaml/route.ts   →   GET /docs/openapi.yaml
```

Express 가 보낸 HTML 안에서 명세 주소가 `/docs/openapi.yaml` 절대 경로로 박혀 있다. 그 주소가
공개 쪽에도 그대로 있어야 화면이 명세를 찾는다 — 그래서 경로 모양을 맞췄다.

**`dynamic = "force-dynamic"` 이 필요하다.**

```ts
export const dynamic = "force-dynamic";
```

요청 객체를 쓰지 않는 `GET` 핸들러는 Next 가 빌드 시점에 한 번 실행해 결과를 굳히려 들 수 있다.
그러면 **도커 이미지를 빌드하는 중에 Express 를 부르게 되고**, 그 자리에 그런 서버는 없다.
빌드 출력에서 `ƒ`(요청마다 실행) 인지 `○`(미리 그림) 인지로 확인한다.

```
├ ƒ /docs
├ ƒ /docs/openapi.yaml
```

## 왜 이렇게 했는가

1. **`server` 에 공개 도메인을 주지 않았다.** 도메인을 붙이면 `/docs` 와 함께 **API 전체가
   인터넷에 열린다.** 9.3 에서 "밖에 나가는 것은 web 하나" 로 정했고, 명세를 보여주자고 그 결정을
   뒤집을 이유는 없다. 이미 `/api/auth/*` 를 같은 방식으로 넘기고 있어 패턴도 새롭지 않다.
2. **`rewrites` 대신 route handler.** `next.config.ts` 의 `rewrites` 로도 된다. 코드로 두면
   왜 이 통로가 있는지를 주석으로 남길 수 있고, 나중에 헤더를 손볼 자리가 생긴다.
3. **`/api` 아래에 두지 않았다.** `/api/docs` 가 아니라 `/docs` 다. 사람이 주소창에 치는 주소라
   API 접두사를 붙일 이유가 없다.

## 직접 해 볼 것

1. `BOARD_API_URL` 을 엉뚱한 주소로 바꾸고 `/docs` 를 연다 → Next 가 `500` 을 낸다. **공개 쪽
   에러지 Express 의 에러가 아니다** — 통로가 끊긴 것과 서버가 틀린 답을 준 것은 다르다.
2. `proxy.ts` 에서 `Content-Type` 옮기는 줄을 지우고 고정값 `text/html` 로 바꾼다 → 화면은 뜨는데
   "Failed to load API definition" 이 뜬다. 명세가 HTML 로 도착해서다.
3. `dynamic = "force-dynamic"` 을 지우고 `pnpm build` 를 돌린다 → 빌드 출력에서 `/docs` 의 표시가
   바뀌는지 본다.

## 다음 단계에서 어떻게 바뀌는가

`Try it out` 은 아직 공개 주소에서 동작하지 않는다. `openapi.yaml` 의 `servers` 에 로컬 주소만
있기 때문이고, 그건 의도다 — 배포 주소를 넣으면 버튼 한 번이 **운영 DB 에 글을 쓴다.** 필요해지면
읽기 전용 환경을 하나 만들어 그 주소를 넣는 편이 맞다.
