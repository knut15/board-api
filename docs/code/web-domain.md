# web/src/domain

> 레이어: domain · 짝: `web/src/domain/**`

## 무엇을 하는 레이어인가

게시판이 무엇인지만 적어 둔 곳이다. 글·댓글·사용자의 모양(타입), 그 위에서 내리는
판단(`canEdit`, `assertValidPostInput`), 에러(`DomainError`) 세 가지가 전부다. **여기서는 아무것도
import 하지 않는다** — react 도 next 도 graphql 도, 다른 레이어도 아니다. 그래서 같은 파일이
브라우저에서도 BFF(`app/api/graphql/route.ts`)에서도 그대로 돈다.

## 코드를 따라 읽기

### `PostSummary` 와 `Post` 를 나눈다

```ts
export type PostSummary = {
  id: string; title: string; author: Author; commentCount: number; createdAt: string;
};

export type Post = {
  id: string; title: string; body: string; author: Author;
  commentCount: number; comments: Page<Comment>; createdAt: string; updatedAt: string;
};
```

`PostSummary` 에 `body` 가 없다. 서버가 그렇게 주기 때문이다 — `docs/02-api.md` 2.4 의
"목록 항목에 `body` 를 넣지 않는다. 상세에서만 준다". `body?: string` 하나로 합치면 타입은
하나지만, 목록 화면에서 `post.body` 를 쓰는 코드가 컴파일을 통과하고 실행해야만 `undefined` 로
드러난다. 나눠 두면 그 자리에서 타입 에러가 난다 — **런타임에 알게 될 일을 컴파일 시점으로
당기는 것**이 이 분리의 전부다.

### `canEdit` 은 버튼을 보여 줄지만 정한다

```ts
export function canEdit(post: { author: { id: string } }, viewerId: string | null): boolean {
  return viewerId !== null && post.author.id === viewerId;
}
```

인자가 `Post` 가 아니라 `{ author: { id: string } }` 다 — `PostSummary` 도 `Post` 도 넘길 수 있다.
중요한 것은 쓰임이다. `presentation/components/PostDetail.tsx` 가
`const editable = canEdit(post, me?.id ?? null)` 로 수정·삭제 버튼의 표시 여부를 정한다.
**이것은 화면 표시용이고 보안 장치가 아니다.** 브라우저에서 도는 코드는 누구든 고칠 수 있으므로
`canEdit` 이 `true` 를 돌려주는 것은 아무것도 보장하지 않는다. 진짜 판정은 Express 의 `403`
이다(`docs/02-api.md` 2.5). 신뢰의 근거로 착각하면 "버튼을 숨겼으니 안전하다" 가 되고, 그 순간
남의 글을 지우는 요청을 막는 것이 아무것도 없게 된다. `canDeleteComment` 도 같은 모양이고,
글쓴이에게 남의 댓글을 지울 권한을 주지 않는다 — `docs/01-domain.md` "안 만들 것" 4번이 역할을
"소유자냐 아니냐" 둘로 못 박았기 때문이다.

### `code` 의 이름을 서버와 맞춘다

```ts
export type DomainErrorCode =
  | "VALIDATION_FAILED" | "EMAIL_ALREADY_EXISTS" | "INVALID_CREDENTIALS" | "UNAUTHENTICATED"
  | "FORBIDDEN" | "POST_NOT_FOUND" | "COMMENT_NOT_FOUND" | "ROUTE_NOT_FOUND" | "INTERNAL_ERROR";
```

`docs/02-api.md` 2.4 의 에러 코드 목록과 글자까지 같다. 이름이 같으면 BFF 가 REST 의
`error.code` 를 받아 `DomainError` 로 바꿀 때 매핑 표가 필요 없다 — 다르게 지었다면 서버 9개와
클라이언트 9개를 잇는 표가 생기고, 코드가 늘 때마다 두 곳을 고쳐야 한다.

`isUnauthenticated` 와 `isForbidden` 도 같은 파일에 있다. 둘 다
`e instanceof DomainError && e.code === "…"` 한 줄이고, 따로 둔 이유는 화면이 다르게 굴어야 하기
때문이다. `401`(UNAUTHENTICATED)은 "누군지 모른다" 이므로 로그인 화면으로 보내면 풀린다.
`403`(FORBIDDEN)은 "누군지는 아는데 권한이 없다" 이므로 로그인 화면으로 보내면 이미 로그인한
사람을 다시 로그인시키는 꼴이 된다. 하나로 묶어 `isAuthError` 를 만들면 이 차이가 사라진다 —
`docs/04-web-architecture.md` 8.7 의 "섞지 않는다" 가 이것이다.

## 왜 이렇게 했는가

**순수함을 사람이 아니라 ESLint 가 지킨다.** `web/eslint.config.mjs` 의 `layerBoundaries` 가
`src/domain/**` 에 대해 `no-restricted-imports` 로 다른 레이어와 외부 패키지를 전부 막는다.
주석으로 "react 쓰지 마세요" 라고 적는 방법도 있지만 주석은 급할 때 읽히지 않는다. 추가 패키지
없이 기본 규칙으로 되는 일이라 `eslint-plugin-boundaries` 는 쓰지 않았다.

**클래스가 아니라 타입과 함수다.** `class Post { canEdit() {...} }` 로 묶으면 서버가 준 JSON 을
매번 인스턴스로 되살려야 하고(`new Post(json)`), 그 변환을 어느 레이어가 할지 또 정해야 한다.
타입은 JSON 그대로 쓰고 판단은 함수에 넘긴다. `DomainError` 만 클래스인 것은 `instanceof` 때문이다.

**불변식을 `throw` 로 알린다.** `assertValidPostInput` 은 `boolean` 이 아니라 `DomainError` 를
던진다. `false` 를 돌려주면 호출한 쪽이 "무엇이 왜 틀렸는지" 를 다시 만들어야 하고 그 메시지가
화면마다 달라진다. 대신 첫 위반에서 멈춰 여러 오류를 모으지는 못한다.

## 직접 해 볼 것

1. `domain/post/entity.ts` 에 `import { useState } from "react";` 를 넣고 `pnpm lint` 를 돌린다.
   `domain 은 외부 패키지를 쓰지 않는다` 가 나온다. `@/application/*` 도 같은 규칙에 걸린다.
2. `PostList.tsx` 에서 목록 항목의 `post.body` 를 읽는 줄을 쓰고 `pnpm typecheck` 를 돌린다.
   `PostSummary` 에 `body: string` 을 임시로 넣으면 타입 에러는 사라지고 화면에는 `undefined` 다.
3. `canEdit` 이 무조건 `true` 를 돌려주게 고치고 남의 글에서 삭제 버튼을 눌러 본다. 버튼은
   보이지만 서버가 `403` 을 주고 `isForbidden` 분기의 메시지가 뜬다. 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 5.2 | 서버 검증이 zod 로 옮겨 간다. `TITLE_MAX`·`COMMENT_MAX` 가 서버와 같은 값인지 확인할 자리가 생긴다 |
| 6.4 | 서버 토큰이 JWT 가 된다. `UNAUTHENTICATED` 가 나오는 경우가 늘지만 이 레이어는 그대로다 |
| 7.4 | `sort` 허용 목록이 붙는다. 정렬 키를 domain 타입으로 올릴지 여기서 정한다 |
