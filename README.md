# 게시판 API

![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9.3-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-5.2.1-000000?style=flat-square&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18.6-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7.10.0-2D3748?style=flat-square&logo=prisma&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-4.6.5-3E67B1?style=flat-square&logo=zod&logoColor=white)
![Pino](https://img.shields.io/badge/Pino-10.3.1-687634?style=flat-square&logo=pino&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16.3.5-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19.2.8-61DAFB?style=flat-square&logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.3.3-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![TanStack Query](https://img.shields.io/badge/TanStack_Query-5.103.1-FF4154?style=flat-square&logo=reactquery&logoColor=white)
![GraphQL](https://img.shields.io/badge/GraphQL-17.0.2-E10098?style=flat-square&logo=graphql&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11.20.0-F69220?style=flat-square&logo=pnpm&logoColor=white)

프론트엔드에서 `fetch` 로만 만나던 서버를 직접 만드는 학습 프로젝트다.
리소스 셋(users · posts · comments)으로 REST 설계를 잡고, 메모리 배열 → PostgreSQL →
인증 → 배포까지 아홉 단계로 간다.

**코드 파일마다 짝이 되는 해설 문서가 하나씩 있다.** 코드 첫 줄 주석이 문서를 가리키고,
문서 첫 줄이 코드를 가리킨다.

→ **[docs/00-overview.md](docs/00-overview.md) 에서 시작한다.**

## 무엇으로 만들었나

| 역할 | 도구 |
|---|---|
| 런타임 | Node.js 22 + TypeScript (ESM) |
| 웹 프레임워크 | Express 5 |
| 데이터베이스 | PostgreSQL 18.6 (Docker) + Prisma 7 |
| 검증 | zod 4 |
| 인증 | argon2id + JWT(jose) + httpOnly 쿠키 리프레시 |
| 로그 | pino |
| 클라이언트 | Next.js 16 · React 19 · TanStack Query |
| 클라이언트 ↔ 서버 | GraphQL BFF (graphql-yoga) → REST |

## 돌려 보기

```bash
pnpm install
cp server/.env.example server/.env        # JWT_SECRET 을 채운다
pnpm --filter board-api-server db:up      # PostgreSQL 컨테이너
pnpm --filter board-api-server migrate    # 스키마 적용
pnpm dev:server                           # Express  :4000
pnpm dev:web                              # Next.js  :3000
```

API 명세는 Swagger UI 로 본다 — 배포본은 **https://web-production-76a42.up.railway.app/docs**,
로컬은 **http://localhost:4000/docs** 다. 원문은 `server/openapi.yaml` 이고
`/docs/openapi.yaml` 로도 받을 수 있다.

`server/requests.http` 를 위에서 아래로 누르면 3단계 시점의 호출 27개를 볼 수 있다.

## 어디까지 왔나

| 단계 | 상태 |
|---|---|
| 1 주제와 도메인 · 2 API 설계 · 3 메모리 CRUD | 끝 |
| 4 PostgreSQL · 5 검증과 에러 · 6 인증 | 끝 |
| 7 목록 고도화 · 8 프론트 연결 | 끝 |
| 9 배포와 운영 | 환경변수·빌드·로그·종료 처리까지. **플랫폼 배포만 남음** |

출처는 아티팩트 "게시판 API 서버, 설계부터 배포까지" 의 아홉 단계 커리큘럼이다.
