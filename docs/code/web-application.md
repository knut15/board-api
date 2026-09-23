# web/src/application

> 레이어: application · 짝: `web/src/application/**`

## 무엇을 하는 레이어인가

"글을 쓴다", "로그인한다" 같은 한 가지 일을 함수 하나로 만들어 둔 곳이다. `ports/` 는 필요한 것의
모양만 적은 인터페이스고, `usecase/` 는 그것을 받아 도메인 규칙을 적용하고 호출하는 함수다. 이
레이어는 `domain` 만 안다 — `web/eslint.config.mjs` 가 `@/infrastructure/*`·`react`·`next` 를 막는다.

## 코드를 따라 읽기

### 포트 — 무엇이 필요한지만 적는다

```ts
export type PostRepository = {
  list(params: { limit?: number; cursor?: string }): Promise<Page<PostSummary>>;
  create(input: { title: string; body: string }): Promise<Post>;
  // findById, update, remove 도 같은 모양
};
```

유스케이스가 "무엇이 필요한지" 만 적고 "어떻게 가져오는지" 는 적지 않는다 — 이 파일에 GraphQL
이라는 글자가 없다. **구현은 `infrastructure/repository/graphqlRepositories.ts` 에 있고, 잇는
일은 `composition/container.ts` 가 한다.** 안쪽이 정한 모양을 바깥쪽이 맞추므로 전송 수단을
바꿔도 안쪽은 그대로고, 반환 타입이 전부 `domain` 타입인 것도 같은 이유다.

### 유스케이스 — `(repo) => (input) => ...`

```ts
export const createPost = (repo: PostRepository) => (input: { title: string; body: string }) => {
  assertValidPostInput(input);
  return repo.create(input);
};
```

함수가 함수를 돌려준다. 바깥 괄호로 의존을 받고, 안쪽 괄호로 실제 입력을 받는다.
`composition/container.ts` 가 `createPost(posts)` 로 한 번 묶어 `api` 에 담아 두면, 화면 쪽은
`api.createPost({ title, body })` 만 부른다 — repo 를 알 일이 없다. 대안이 둘 있었다.
**클래스**로 만들어 생성자에 repo 를 받으면 하는 일은 같지만 메서드가 하나뿐인 클래스가 열 개
생긴다. **매 호출마다 repo 를 넘기면**(`createPost(repo, input)`) 화면 컴포넌트가 repo 를 들고
있어야 해서 presentation 이 infrastructure 를 알게 된다. 커링은 주입 지점을 한 곳으로 모은다.

### `login` 은 토큰 저장까지 한다

```ts
export const login =
  (gateway: AuthGateway, tokens: TokenStorage) =>
  async (input: { email: string; password: string }) => {
    const result = await gateway.login(input);
    tokens.set(result.token);
    return result.user; // token 은 화면에 돌려주지 않는다
  };
```

의존을 둘 받는다. 부수 효과인 토큰 저장이 유스케이스 안에 있다. 화면이 맡는 방법도 있다 —
컴포넌트가 `{ token, user }` 를 받아 `tokens.set(token)` 을 부르는 식이다. 그러면 **로그인 경로가
늘 때마다 빠뜨릴 곳이 생긴다.** 지금은 로그인 폼 하나지만 가입 직후 자동 로그인, 토큰 만료 후
재로그인이 붙으면 세 곳이 되고, 한 곳만 빠뜨려도 "로그인은 됐는데 새로고침하면 풀리는" 증상이
된다. 그래서 반환값이 `user` 뿐이다.

### 클라이언트 검증은 서버 검증을 대신하지 않는다

`createPost`·`editPost` 가 `assertValidPostInput` 을, `addComment` 가 `assertValidCommentInput`
을 먼저 부른다. 서버도 같은 검사를 한다(`server/src/routes/posts.ts`). 먼저 막는 이유는 둘뿐이다
— **왕복을 줄이는 것**, 그리고 **입력란 옆에 메시지를 띄우는 것**. 여기를 지우면 서버가 막지만,
서버 쪽을 지우면 아무것도 막지 못한다. 두 검사는 대칭이 아니다.

### `TokenStorage` 포트가 따로 있는 이유

`get()`·`set(token)`·`clear()` 셋뿐인 포트다. `localStorage` 를 유스케이스에서 직접 부르면 `login`
이 브라우저에서만 도는 함수가 된다. 더 큰 이유는 다음에 있다 — 커리큘럼 6.7 에서 토큰을 httpOnly
쿠키로 옮기면(쿠키는 자바스크립트가 읽지 않는다) 바뀌는 파일은 구현체
`infrastructure/auth/tokenStorage.ts` 하나다. `login` 과 `logout` 은 그대로다.

## 왜 이렇게 했는가

**파일을 함수가 아니라 리소스로 나눈다.** 포트 넷을 `ports/repositories.ts` 하나에, 유스케이스를
`usecase/{posts,comments,auth}.ts` 셋에 담았다. 포트 넷을 합쳐도 37줄이라 더 쪼개면 여는 파일만 는다.
유스케이스마다 파일을 주면 `listPosts.ts` 가 세 줄짜리가 되고 import 문이 본문보다 길어진다.
한 파일이 읽기 어려워지면 그때 리소스 안에서 다시 나눈다 — 기준은 `04-web-architecture.md` 에 있다.

**`listPosts` 와 `getPost` 는 그냥 repo 를 부른다.** 규칙이 없으니 한 겹을 덜어도 되지만, 화면이
알아야 할 이름을 `api` 하나로 묶어 둔다. 규칙이 없는 것과 있는 것을 화면이 구분해 부르면 나중에
`getPost` 에 규칙이 붙는 날 부르는 쪽을 전부 찾아야 한다.

## 직접 해 볼 것

1. `usecase/posts.ts` 에 `import { createGraphqlClient } from "@/infrastructure/graphql/client";`
   를 넣고 `pnpm lint` 를 돌린다. `application 은 domain 만 안다` 가 나온다. `react` 도 같다.
2. `createPost` 에서 `assertValidPostInput(input);` 을 지우고 빈 제목으로 글을 써 본다.
   요청이 서버까지 가서 막히는지, 화면 메시지가 어떻게 달라지는지 본다. 되돌린다.
3. `login` 에서 `tokens.set(result.token);` 를 지우고 로그인한다. 된 것처럼 보이지만
   새로고침하면 풀린다. 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 6.7 | 토큰이 httpOnly 쿠키로 간다. `TokenStorage` 구현만 바뀌고 `usecase/auth.ts` 는 그대로다 |
| 7.4 | `GET /posts` 에 `sort`·`q`·`authorId` 가 붙어 `PostRepository.list` 의 `params` 가 넓어진다. 8.6 의 무한스크롤이 쓸 `cursor` 는 이미 받게 되어 있다 |
