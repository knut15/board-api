# 7문서 — 검증과 에러 처리 (커리큘럼 5단계)

출처: 아티팩트 "게시판 API 서버, 설계부터 배포까지" 5단계
<https://claude.ai/artifact/WffCicExjmUU5R7yfvba1H>

잘못된 요청이 들어와도 서버가 언제나 같은 모양으로 답한다.
핸들러 안에서 `if` 로 막던 것을 한 곳으로 모으고, 응답을 만드는 곳도 한 곳으로 줄인다.

문서 번호(07)는 읽는 순서이고 커리큘럼 단계(5)와 다르다.

## 무엇이 어디로 갔나

5단계는 새 기능을 만들지 않는다. **있던 것을 옮긴다.**

| 하던 일 | 4단계까지 | 지금 |
|---|---|---|
| 형식 검사 | 핸들러 안 `if (typeof title !== "string")` | `validate({ body: CreatePostBody })` 미들웨어 |
| 검사 규칙 | 핸들러마다 흩어짐 | `src/schemas/index.ts` 한 파일 |
| 에러 만들기 | `fail(res, 404, "POST_NOT_FOUND", …)` | `throw postNotFound()` |
| 에러 → 응답 | 라우터가 직접 | `src/middleware/errorHandler.ts` 하나 |
| Prisma 에러 번역 | 저장소마다 `catch (P2025)` | `errorHandler` 하나 |

새로 생긴 파일 넷.

| 파일 | 무엇 | 문서 |
|---|---|---|
| `src/schemas/index.ts` | 요청 스키마와 거기서 뽑은 타입 | [code/schemas.md](./code/schemas.md) |
| `src/middleware/validate.ts` | 검증 미들웨어와 400/422 판정 | [code/validate.md](./code/validate.md) |
| `src/errors.ts` | 도메인 에러 클래스와 `ERROR_CODES` | [code/errors.md](./code/errors.md) |
| `src/middleware/errorHandler.ts` | 4xx·5xx 바디를 만드는 유일한 곳 | [code/error-handler.md](./code/error-handler.md) |

## 5.2 검사를 미들웨어로 — 라우터에 남은 것

핸들러가 하는 일이 셋으로 줄었다. **저장소 호출 · 소유권 판단 · 성공 응답.**

```ts
postsRouter.post("/", requireAuth, validate({ body: CreatePostBody }), async (req, res) => {
  const { title, body } = validBody<CreatePostBody>(req);
  const post = await posts.create({ authorId: req.user!.id, title, body });
  const created = await postDetailView(post, emptyCommentPage);
  res.status(201).location(`/posts/${post.id}`).json(created);
});
```

`req.body` 를 직접 읽지 않는다. `req.body` 에는 아무거나 들어올 수 있고,
`validBody()` 로 꺼내는 값은 스키마를 통과한 것만 들어 있다. 그 차이가 타입에도 드러난다.

**Express 5 에서는 파싱 결과를 `req.query` 에 되돌려 넣을 수 없다.** 읽기 전용 getter 라서다.
그래서 검증된 값을 `req.valid` 라는 자리에 따로 담는다.

## 5.4 · 5.5 에러를 값으로

던지는 쪽은 "무엇이 잘못됐는지" 만 말한다. 상태 코드는 클래스가 안다.

```ts
if (!post) throw postNotFound();
if (post.authorId !== req.user!.id) throw new ForbiddenError("내 글만 수정할 수 있습니다.");
```

`fail(res, 403, "FORBIDDEN", …)` 과 견주면 두 가지가 낫다.

1. **`return` 을 잊을 수 없다.** `fail()` 은 응답을 보내지만 함수를 멈추지 않아서
   `return` 을 빠뜨리면 아래가 계속 돌고 `ERR_HTTP_HEADERS_SENT` 가 났다. `throw` 는 그 자리에서 벗어난다.
2. **응답 모양이 한 곳에서만 정해진다.** 같은 뜻의 에러가 곳곳에서 조금씩 다르게 나갈 길이 없다.

## 2.3 의 판정선 — 코드로 옮기며 고친 것

`02-api.md` 2.3 에는 zod 3 기준 이슈 이름(`invalid_enum_value`, `invalid_string`)이 적혀 있었다.
설치한 zod 는 4.6.5 이고 이름이 다르다. 실제로 찍어 보고 맞췄다.

| 입력 | zod 4 이슈 |
|---|---|
| `title` 에 숫자 / 필드 누락 | `invalid_type` |
| 스키마에 없는 필드 | `unrecognized_keys` |
| enum 에 없는 값 | `invalid_value` |
| uuid·email 형식이 아님 | `invalid_format` |
| 길이 미달 / 초과 | `too_small` · `too_big` |
| `refine` 위반 | `custom` |

**그리고 규칙을 하나 더 두었다.** 처음에는 이슈 코드만으로 400/422 를 갈랐는데,
그러면 `?limit=999` 가 `custom` 이라 422 가 된다. 명세 표는 400 이라고 적혀 있었다.

둘을 맞추느라 **위치를 먼저 본다** 로 정했다.

1. 쿼리 파라미터와 경로 파라미터의 문제는 **언제나 400**. 주소에 실려 오는 값이라 형식의 문제로 본다.
2. 본문만 형식(400)과 값(422)을 zod 이슈 코드로 가른다.
3. 섞이면 400 이 이긴다.

`02-api.md` 2.3 을 이 규칙으로 고쳤다. 명세와 코드가 어긋나면 명세를 고치는 것이 순서다.

## 5.7 Prisma 에러 번역 — 한 곳에서

`P2002`(유니크 충돌) → `409`, `P2025`(레코드 없음) → `404`, `P2003`(외래키 위반) → `404`.
그 밖의 Prisma 에러는 `500` 으로 보낸다. 원문을 내보내면 스키마 구조가 새어 나간다.

`instanceof` 대신 **`code` 의 모양**(`/^P\d{4}$/`)으로 알아본다. Prisma 7 은 드라이버 어댑터를 거치면서
에러 객체가 여러 경로로 만들어지는데 `code` 는 어느 경로로 와도 같다.

4단계에서는 저장소마다 `catch (P2025) → null` 이 있었다. 지금은 걷어냈다 —
**같은 번역이 두 곳에 있으면 언젠가 갈라진다.** 라우터가 고치기 전에 존재를 확인하므로
`P2025` 는 확인과 수정 사이에 남이 그 글을 지운 경우에만 나고, 그때 404 가 나가는 것이 맞다.

## 고친 결함 둘

게이트 검사를 만들면서 드러났다. 둘 다 **500 이 나가면 안 되는 자리에서 500 이 나가던 것**이다.

**1. `x-user-id` 가 uuid 가 아니면 500.** 4단계에서 `id` 가 DB 의 uuid 컬럼이 되면서,
형식이 아닌 값을 그대로 조회하면 Prisma 가 던졌다. 못 알아본 토큰은 "누군지 모름"(401)이지
서버 잘못이 아니다. `currentUser` 가 모양을 먼저 보고 아니면 조회하지 않게 고쳤다.

**2. 본문 JSON 이 깨지면 500.** `express.json()` 이 던지는 파싱 에러를 아무도 받지 않았다.
`entity.parse.failed` 를 알아보고 400 으로 옮긴다. 이 에러의 메시지에는 깨진 본문 일부가
들어 있어 그대로 내보내지 않는다.

## 이 단계의 통과 조건

- [x] 잘못된 입력 12종을 보내 전부 같은 형식의 4xx 를 받는다
- [x] 응답 어디에도 스택 트레이스와 DB 내부 이름이 없다
- [x] 핸들러 안에 수동 검증 `if` 문이 0개다

### 검증 기록 (2026-09-22)

| 무엇 | 어떻게 | 결과 |
|---|---|---|
| 잘못된 입력 | 12종(빈 제목·숫자 제목·필드 누락·모르는 필드·201자·깨진 JSON·uuid 아닌 경로·limit 3종·빈 PATCH·빈 댓글) | **12/12**, 전부 `{error:{code,message,details}}` |
| 누출 | 위 12종 + P2025·P2002·없는 경로·토큰 없음 4종의 응답 전문을 검사 | **16/16 clean**. 스택·`node_modules`·SQL·테이블명·`_fkey` 없음 |
| 응답 형태 | 최상위 키가 `error` 하나인지 | 16건 전부 그렇다 |
| 회귀 | 3·4단계에 쓰던 검사(멱등성·소유권·페이지네이션 포함) | **40 통과 · 0 실패** |
| 핸들러의 검증 `if` | `grep -nE "if \(.*(typeof\|length\|Number\.isInteger)" src/routes/*.ts` | **0개** |
| 라우터의 `fail()` | grep | **0회**. `res.status` 는 성공 응답 5곳(201 ×3, 204 ×2)만 |
| 라우터의 `throw` | grep | auth 3 · posts 6 · comments 4 |
| 타입 | `tsc --noEmit` | 오류 0 |

## 다음 단계

6단계는 인증과 권한이다. 비밀번호를 argon2 로 해시하고(컬럼도 `passwordHash` 로 rename 하는
마이그레이션이 하나 더 생긴다), 토큰을 JWT 로 바꾸고, `x-user-id` 흉내를
`Authorization: Bearer` 로 교체한다. 지금 `currentUser` 한 파일만 고치면 라우터는 그대로다 —
이번에는 그 약속이 지켜지는지 확인할 차례다.
