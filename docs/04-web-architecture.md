# 4문서 — 클라이언트 아키텍처 (DDD)

Next.js 클라이언트의 레이어 경계와 의존 방향을 코드보다 먼저 확정한다.
커리큘럼이 2단계(API 설계)를 코드보다 앞에 둔 것과 같은 이유다 —
경계를 나중에 정하면 매 파일마다 즉흥으로 정하게 되고, 그 결정들은 서로 어긋난다.

전제: [00-overview.md](./00-overview.md) 의 구조(서버 REST + Next 안 GraphQL BFF),
[02-api.md](./02-api.md) 의 REST 명세.

## 무엇을 DDD 라고 부르는가

프론트엔드에서 DDD 는 대개 **폴더 이름이 아니라 의존 방향**을 뜻한다.
이 문서가 지키려는 것은 하나다 — **안쪽은 바깥쪽을 모른다.**

```
        presentation          app/
             │                 │
             ▼                 ▼
        application ◄──── composition ────► infrastructure
             │                                    │
             ▼                                    ▼
          domain ◄───────────────────────────────┘
```

`domain` 은 아무것도 import 하지 않는다. React 도, Next 도, GraphQL 도 모른다.
그래서 `domain` 의 코드는 브라우저에서도 BFF(서버)에서도 그대로 돈다 — 규칙을 두 번 쓰지 않는다.

## 레이어 다섯

| 레이어 | 무엇이 들어가나 | import 해도 되는 것 |
|---|---|---|
| `domain` | 엔티티 타입, 불변식, 권한 판단, 도메인 에러 | **없음** (표준 라이브러리만) |
| `application` | 유스케이스, 포트(인터페이스) | `domain` |
| `infrastructure` | 포트 구현 — GraphQL 클라이언트, REST 어댑터, 토큰 저장소 | `domain`, `application/ports` |
| `presentation` | React 컴포넌트, 훅, 스타일 | `application`, `domain` |
| `composition` | 조립 지점. 구현체를 유스케이스에 꽂는다 | 전부 |

`app/`(Next App Router)은 레이어가 아니라 **라우팅 껍데기**다. 페이지 파일은 얇게 두고
`presentation` 의 컴포넌트를 불러다 놓는 일만 한다.

### 금지 import — 이 다섯 줄이 규칙의 전부다

| 하는 쪽 | 하면 안 되는 것 | 왜 |
|---|---|---|
| `domain/**` | 모든 외부 패키지와 다른 레이어 | 순수해야 브라우저·서버 양쪽에서 돈다 |
| `application/**` | `infrastructure`, `presentation`, `app`, `react`, `next` | 유스케이스가 화면과 전송 수단을 모르게 한다 |
| `presentation/**` | `infrastructure` | 컴포넌트가 GraphQL 을 직접 부르기 시작하면 경계가 사라진다 |
| `infrastructure/**` | `presentation`, `app` | 어댑터가 화면을 알 이유가 없다 |
| 아무 레이어 | 상대 경로로 레이어를 건너뛰기 (`../../infrastructure/...`) | 경로 별칭(`@/domain` 등)만 쓴다 |

**강제 방법**: ESLint 기본 규칙 `no-restricted-imports` 로 레이어별 `zones` 를 정한다.
추가 패키지 없이 된다. `eslint-plugin-boundaries` 를 쓰면 더 정교하지만 지금 규모에는 과하다.
규칙을 못 지키는 곳이 나오면 **규칙을 끄지 말고 이 문서를 고친다.**

## 폴더 구조

```
web/src/
  domain/
    post/      entity.ts  policy.ts
    comment/   entity.ts  policy.ts
    user/      entity.ts
    shared/    errors.ts          # DomainError, NotFound, Forbidden
  application/
    ports/     repositories.ts            # 포트 4개를 한 파일에
    usecase/   posts.ts  comments.ts  auth.ts
  infrastructure/
    graphql/   client.ts  documents.ts    # graphql-request, 쿼리 문서
    repository/  graphqlRepositories.ts
    rest/      boardApiClient.ts          # BFF 안에서 Express 를 부르는 어댑터
    auth/      tokenStorage.ts
  presentation/
    components/   PostList.tsx  PostDetail.tsx  CommentSection.tsx
                  LoginForm.tsx  NewPostForm.tsx  SiteHeader.tsx
                  QueryProvider.tsx  ui.tsx
    hooks/        usePosts.ts  useAuth.ts
    styles/       tokens.css
    format.ts
  composition/    container.ts  queryKeys.ts
  app/
    layout.tsx  page.tsx  globals.css
    posts/[id]/page.tsx
    login/page.tsx
    api/graphql/route.ts          # BFF
```

**파일을 나누는 기준은 리소스다**(`posts` · `comments` · `auth`). 함수 하나에 파일 하나를 주면
`listPosts.ts` 가 세 줄짜리가 되고 import 문이 본문보다 길어진다. 한 파일이 읽기 어려워지면
그때 리소스 안에서 다시 나눈다.

## 두 개의 "서버" 를 헷갈리지 않기

Next.js 안에서 코드가 도는 곳이 둘이다.

```
[브라우저]  presentation → application(usecase) → infrastructure/graphql
                                                        │  POST /api/graphql
                                                        ▼
[Next 서버]  app/api/graphql/route.ts  (BFF: 스키마 + 리졸버)
                        │ → infrastructure/rest → fetch
                        ▼
[Express]   REST 11개 → Map (4단계에서 PostgreSQL)
```

- **브라우저 쪽** 유스케이스는 `PostRepository` 포트를 통해 GraphQL 을 부른다.
- **BFF 쪽** 리졸버는 `infrastructure/rest` 로 Express 를 부른다. 리졸버에 도메인 규칙을 넣지 않는다 —
  규칙은 `domain` 에 있고 양쪽이 같은 파일을 쓴다.
- **권한 판단은 두 곳에서 한다.** 브라우저에서는 버튼을 숨기려고(`canEdit`), 서버에서는 진짜로 막으려고.
  브라우저 쪽 판단은 **표시용**이고 신뢰의 근거가 아니다. 최종 판정은 Express 의 `403` 이다.

## 코드와 문서 매칭

코드 파일 첫 줄 주석에 짝이 되는 문서가 적혀 있다. 반대 방향은 이 표다.

| 코드 | 문서 | 무엇을 배우는가 |
|---|---|---|
| `web/src/domain/**` | [code/web-domain.md](./code/web-domain.md) | 아무것도 import 하지 않는 레이어, 화면 표시용 권한 판단 |
| `web/src/application/**` | [code/web-application.md](./code/web-application.md) | 포트와 유스케이스, 의존을 주입하는 방식 |
| `web/src/infrastructure/**` | [code/web-graphql.md](./code/web-graphql.md) | API 클라이언트 한 겹, 에러를 도메인 에러로 바꾸는 자리 |
| `web/src/app/api/graphql/route.ts` | [code/web-bff.md](./code/web-bff.md) | BFF — GraphQL 을 REST 로 바꾸는 곳, 두 규약이 어긋나는 지점 |
| `web/src/composition/**` | [code/web-composition.md](./code/web-composition.md) | 조립 지점, 캐시 키 주소록 |
| `web/src/presentation/**`, `web/src/app/**/page.tsx` | [code/web-presentation.md](./code/web-presentation.md) | queryKey · staleTime · 무효화 · 무한스크롤 |
| `web/src/presentation/styles/tokens.css` | [05-design.md](./05-design.md) | 색·활자·레이아웃을 그렇게 정한 이유 |

## 커리큘럼 8단계 항목이 어디에 앉는가

| 커리큘럼 | 어디에 | 비고 |
|---|---|---|
| 8.1 CORS | Express 쪽 | BFF 를 거치면 브라우저는 같은 출처로 부른다. CORS 가 필요한 경우는 브라우저가 Express 를 직접 부를 때뿐이다 — 이 구조에서는 그 경로가 없다 |
| 8.2 API 클라이언트 한 겹 | `infrastructure/graphql/client.ts` | REST 에러 → GraphQL 에러 변환은 BFF 리졸버에서 한다 |
| 8.3 queryKey 설계 | `composition/queryKeys.ts` | 키 만드는 함수를 한 파일에 모은다 |
| 8.4 staleTime | `presentation/hooks/*` | 목록과 상세에 각각 값을 정하고 이유를 주석으로 남긴다 |
| 8.5 mutation 과 무효화 | `presentation/hooks/*` | 유스케이스 호출 + `invalidateQueries` |
| 8.6 무한스크롤 | `presentation/hooks/usePosts.ts` | 커서는 REST `pageInfo.nextCursor` 가 GraphQL 을 거쳐 그대로 온다 |
| 8.7 인증 상태 | `infrastructure/auth` + `presentation` | `401` → 로그인 화면, `403` → 권한 안내. 섞지 않는다 |

## 정한 것

| 무엇 | 어떻게 | 왜 · 바꿀 때 고칠 위치 |
|---|---|---|
| GraphQL 서버(BFF) | **graphql-yoga** | Route Handler 에 `Response` 를 그대로 돌려주는 형태로 붙는다. `app/api/graphql/route.ts` |
| GraphQL 클라이언트 | **graphql-request** | 캐시를 갖지 않는 얇은 fetch 래퍼다. 캐시는 TanStack Query 가 맡는다 |
| 서버 상태 관리 | **TanStack Query** | 커리큘럼 8.3~8.6 이 `queryKey`·`staleTime`·`invalidateQueries`·`useInfiniteQuery` 를 직접 다루라고 한다. Apollo Client 를 쓰면 그 실습이 Apollo 캐시로 대체되어 커리큘럼과 어긋난다 |
| 스타일 | **Tailwind CSS v4** | create-next-app 기본값. 디자인 토큰은 `presentation/styles/tokens.css` 한 곳에 둔다 |
| 경계 강제 | ESLint `no-restricted-imports` | `web/eslint.config.mjs` |
| 코드 생성 | **쓰지 않는다** | GraphQL Codegen 은 도구가 하나 더 늘고 스키마가 자주 바뀌는 초반에 잡음이 크다. 타입은 손으로 쓰고, 스키마가 굳으면 다시 본다 |

## 이 문서의 통과 조건

- [x] 레이어 5개와 각 레이어가 import 해도 되는 것이 표로 있다
- [x] 금지 import 5줄과 강제 방법이 정해져 있다
- [x] 폴더 구조가 파일 단위까지 적혀 있다
- [x] 브라우저와 BFF 에서 각각 무엇이 도는지 그림으로 갈라져 있다
- [x] ESLint 규칙이 실제로 위반을 잡는지 확인했다

### 검증 기록 (2026-09-22)

위반 코드를 일부러 만들어 `pnpm --filter board-api-web lint` 를 돌렸다.

| 넣은 코드 | 결과 |
|---|---|
| `src/domain/*` 에서 `@/composition/container` import | `no-restricted-imports` 에러 + 정해 둔 메시지 |
| `src/presentation/*` 에서 `@/infrastructure/auth/tokenStorage` import | 같음 |

확인 뒤 검증용 파일은 지웠다. 통과 상태에서 에러 0, 경고 0.
