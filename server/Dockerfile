# 커리큘럼 9.2 · 9.3 — Express 서버 이미지.
#
# 레포 루트를 빌드 컨텍스트로 쓴다. pnpm 워크스페이스라 루트의 lockfile 과
# pnpm-workspace.yaml 이 있어야 의존성이 잠긴 대로 설치된다.
#
#   docker build -f server/Dockerfile -t board-api-server .
#   docker run --rm -p 4000:4000 -e DATABASE_URL=… -e JWT_SECRET=… board-api-server

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---- 의존성 --------------------------------------------------------------
# package.json 들만 먼저 복사한다. 소스가 바뀌어도 이 층은 캐시가 살아 있다.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter board-api-server...

# ---- 빌드 ----------------------------------------------------------------
FROM deps AS build
COPY server/ server/

# prisma generate 는 DB 에 붙지 않는다. 스키마만 읽어 클라이언트를 만든다.
# 그런데 prisma.config.ts 의 datasource 가 값을 요구해서, 없으면 설정 로딩에서 죽는다.
# 빌드 단계에만 자리표시자를 준다 — 이 값으로 연결하는 일은 없다.
# 운영에서 쓰는 주소는 플랫폼이 주입하고, 그때 env.ts 가 형식을 검증한다(9.1).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN pnpm --filter board-api-server build

# ---- 실행 ----------------------------------------------------------------
# pnpm deploy 가 심링크를 실제 파일로 풀어 자립 가능한 디렉터리를 만든다.
# 워크스페이스 node_modules 를 그대로 복사하면 심링크가 깨진다.
#
# --prod 를 쓰지 않는 이유: 릴리스 커맨드가 prisma CLI 로 마이그레이션을 돌린다.
# 이미지가 커지는 대신 배포 시점에 스키마를 맞출 수 있다.
FROM build AS bundle
RUN pnpm deploy --filter board-api-server --legacy /bundle

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=bundle /bundle/node_modules ./node_modules
COPY --from=bundle /bundle/dist ./dist
COPY --from=bundle /bundle/prisma ./prisma
COPY --from=bundle /bundle/package.json ./package.json
COPY --from=build /app/server/prisma.config.ts ./prisma.config.ts

# 여기서 한 번 더 생성한다.
# pnpm deploy 는 스토어에 있는 패키지 원본을 복사하므로, 앞 단계에서 만든
# Prisma 클라이언트 생성물이 따라오지 않는다. 그대로 두면 실행할 때
# "Named export 'PrismaClient' not found" 로 죽는다 — 실제로 겪었다.
#
# 자리표시자를 ENV 로 두지 않고 이 줄에서만 준다. 이미지에 남으면
# 플랫폼이 DATABASE_URL 주입을 잊었을 때 부팅이 실패하는 대신
# 엉뚱한 주소로 붙으려 든다 — 조용히 틀리는 쪽이 더 나쁘다.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public" \
    ./node_modules/.bin/prisma generate

# root 로 돌리지 않는다. 컨테이너가 뚫렸을 때 할 수 있는 일을 줄인다.
USER node

EXPOSE 4000

# 플랫폼이 이 경로를 헬스체크에 물린다(9.6).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 마이그레이션은 여기서 돌리지 않는다. 컨테이너가 여러 개 뜨면 동시에 돌게 된다.
# 플랫폼의 릴리스 커맨드에 맡긴다 — docs/12-deploy-prep.md 참고.
CMD ["node", "dist/server.js"]
