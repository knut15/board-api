# 커리큘럼 9.2 · 9.3 — Next.js 클라이언트 이미지.
#
# 이 서버는 화면만 그리는 것이 아니다. /api/graphql 의 BFF 와
# /api/auth/* 의 쿠키 프록시가 여기서 돈다(8단계). 그래서 상주 프로세스가 필요하다.
#
#   docker build -f web/Dockerfile -t board-api-web .
#   docker run --rm -p 3000:3000 -e BOARD_API_URL=http://server:4000 board-api-web

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --filter board-api-web...

FROM deps AS build
COPY web/ web/
# 빌드 시점에 서버가 없어도 된다. BFF 는 요청이 올 때만 Express 를 부른다.
RUN pnpm --filter board-api-web build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

# standalone 출력은 세 조각으로 나뉜다. 셋을 제자리에 놓아야 돈다.
#   standalone/  서버 + 추려낸 node_modules
#   static/      해시 붙은 JS·CSS. standalone 안에 들어가지 않는다
#   public/      정적 파일
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static
COPY --from=build /app/web/public ./web/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# standalone 은 자기 server.js 를 만든다. next start 가 아니다.
CMD ["node", "web/server.js"]
