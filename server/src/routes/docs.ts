// 문서: docs/code/routes-docs.md · 커리큘럼 2.6
//
// 프론트엔드 개발자에게 API 명세를 보여준다.
//
// 지금까지 openapi.yaml 은 **파일일 뿐이었다.** 보려면 각자 에디터로 열어야 했고,
// 그러면 누가 어느 시점의 명세를 보고 있는지 아무도 모른다. 주소 하나로 만든다.

import { Router } from "express";
import { existsSync, readFileSync } from "node:fs";
import { AppError } from "../errors.js";

export const docsRouter = Router();

// 실행 디렉터리 기준이다. env.ts 가 .env 를 찾는 방식과 같다.
// 도커 이미지에는 Dockerfile 이 이 파일을 /app 으로 복사해 둔다.
const SPEC = "openapi.yaml";

// Swagger UI 를 의존성으로 받지 않고 CDN 에서 가져온다.
// 이 페이지는 **개발자에게 보여주는 화면**이라 서버 번들에 넣을 이유가 없고,
// 넣으면 이미지에 정적 파일 수 메가바이트가 따라붙는다.
//
// 버전을 못 박는다. latest 를 쓰면 CDN 쪽이 바뀌는 날 화면이 같이 바뀐다.
const SWAGGER_UI = "5.33.0";

// 1. 명세 원문. Swagger UI 가 이 주소를 읽는다.
//
// 요청마다 읽는다. 시작할 때 한 번 읽어 두면 빨라지지만, 개발 중에 명세를 고치고
// 새로고침했을 때 옛 내용이 나온다 — 이 경로에서는 그게 더 비싸다.
docsRouter.get("/openapi.yaml", (_req, res) => {
  // 새 에러 코드를 만들지 않는다. 이건 요청이 잘못된 게 아니라 **이미지가 잘못 만들어진** 것이다.
  // Dockerfile 이 이 파일을 복사하지 않으면 여기서 걸린다 — Prisma 생성물로 이미 한 번 겪었다.
  if (!existsSync(SPEC)) {
    throw new AppError(500, "INTERNAL_ERROR", `명세 파일(${SPEC})이 실행 디렉터리에 없습니다.`);
  }
  res.type("text/yaml; charset=utf-8").send(readFileSync(SPEC, "utf8"));
});

// 2. 화면.
docsRouter.get("/", (_req, res) => {
  res.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>게시판 API 명세</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI}/swagger-ui.css">
  <style>body { margin: 0 }</style>
</head>
<body>
  <div id="ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI}/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      // 절대 경로로 적는다. "openapi.yaml" 이라고 쓰면 /docs 에서는
      // /openapi.yaml 로 풀려 404 가 된다(끝에 슬래시가 없어서).
      url: "/docs/openapi.yaml",
      dom_id: "#ui",
      // 스펙에 적힌 순서를 그대로 보여준다. 기본값은 알파벳 정렬이라
      // 가입 → 로그인 → 글 순서로 읽히지 않는다.
      operationsSorter: null,
      tagsSorter: null,
    });
  </script>
</body>
</html>`);
});
