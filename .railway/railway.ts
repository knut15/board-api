// 커리큘럼 9.3 · 9.4 — Railway 프로젝트를 코드로 선언한다.
//
//   railway config plan    무엇이 바뀌는지 미리 본다
//   railway config apply   적용한다
//
// 대시보드에서 클릭하지 않는 이유는 하나다. 클릭은 기록이 남지 않는다 —
// 왜 그 값인지, 언제 바뀌었는지 아무도 모른다. 이 파일은 커밋된다.

import { defineRailway, postgres, project, service } from "railway/iac";

export default defineRailway((ctx) => {
  // Railway 의 관리형 Postgres 를 쓴다. 볼륨과 백업을 플랫폼이 맡는다.
  //
  // 처음에는 로컬(16)에 맞추려고 이미지를 16 으로 못 박았다가 되돌렸다.
  // 이미 18 로 초기화된 데이터 디렉터리 위에 16 이미지를 얹으면 Postgres 가 뜨지 않는다 —
  //   "This image runs PostgreSQL 16 but the data directory holds major version 18"
  // 이미지 태그를 바꾸는 것은 업그레이드가 아니다. 대신 로컬 compose 를 18 로 올려 맞췄다.
  const db = postgres("db");

  const server = service("server", {
    // 이미 빌드해서 돌려 본 이미지를 그대로 쓴다. 빌드 컨텍스트는 레포 루트다 —
    // pnpm 워크스페이스라 루트의 lockfile 이 있어야 의존성이 잠긴 대로 설치된다.
    build: { builder: "DOCKERFILE", dockerfilePath: "server/Dockerfile" },

    start: "node dist/server.js",

    // 배포당 한 번 도는 자리(9.4). CMD 에 넣으면 컨테이너가 여러 개 뜰 때 동시에 돈다.
    preDeploy: "./node_modules/.bin/prisma migrate deploy",

    healthcheck: "/health",
    healthcheckTimeout: 30,

    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      // SIGTERM 을 보낸 뒤 SIGKILL 까지 기다리는 시간.
      // 우리 종료 처리의 강제 종료 타임아웃이 10초라 그보다 길어야 정상 종료가 먼저 끝난다(9.6).
      drainingSeconds: 15,
      // 새 배포가 뜬 뒤에 옛 것을 내린다 — 배포 중에 끊기지 않는다.
      overlapSeconds: 10,
    },

    env: {
      // Postgres 서비스가 만드는 주소를 참조한다. 값을 베껴 적지 않는다 —
      // 베끼면 DB 를 다시 만들 때마다 손으로 고쳐야 한다.
      DATABASE_URL: db.env.DATABASE_URL,

      // 로컬 .env 의 값을 쓰지 않는다. 운영 키는 여기서 새로 만든다.
      JWT_SECRET: ctx.randomString("jwt-secret", 32),

      NODE_ENV: "production",
      LOG_LEVEL: "info",

      // 포트를 못 박는다. 아래 web 이 이 주소로 부르는데 그 값이 예측 가능해야 한다.
      PORT: "4000",
    },
  });

  const web = service("web", {
    build: { builder: "DOCKERFILE", dockerfilePath: "web/Dockerfile" },
    start: "node web/server.js",
    healthcheck: "/",
    healthcheckTimeout: 30,

    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      drainingSeconds: 15,
      overlapSeconds: 10,
    },

    env: {
      // 내부 주소로 부른다. Express 를 인터넷에 열지 않아도 되는 것이
      // BFF 구조의 덤이다(docs/12-deploy-prep.md).
      BOARD_API_URL: "http://server.railway.internal:4000",
      PORT: "3000",
    },
  });

  return project("board-api", { resources: [db, server, web] });
});
