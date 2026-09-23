# server/src/views.ts

> 커리큘럼 2.4 · 3.6 · 4.5 · 4.6 · 7.7 · 짝: `server/src/views.ts`

## 무엇을 하는 파일인가

성공 응답의 바디를 만드는 함수를 모아 둔다. `docs/02-api.md` 2.4 "바디 형태" 의 예시 JSON 과 1:1 로
대응하고, 저장소에서 꺼낸 객체를 그대로 내보내지 않고 나갈 필드를 여기서 고른다. 4단계부터는
**한 응답에 쿼리가 몇 번 나가는지를 정하는 파일**이기도 했다 — `await` 하나가 대체로 쿼리 하나다.
7.7 에서 목록 쪽 `await` 를 전부 저장소로 옮겼고, 그래서 목록 항목 뷰에는 이제 `await` 가 없다.

## 코드를 따라 읽기

```ts
export async function authorView(userId: string) {
  const user = await users.findById(userId);
  if (!user) return null;
  return { id: user.id, nickname: user.nickname };
}
```

`User` 에는 `email` 과 `password` 도 있지만 `id` 와 `nickname` 만 뽑는다. **넣을 것을 고르는 방식**이고,
반대편에는 민감한 필드만 지우는 방식(`delete copy.password`) 이 있다. 차이는 필드가 하나 늘 때의
기본값이다 — 지우는 방식에서는 새 필드가 기본으로 노출되고, 고르는 방식에서는 안 나간다.

`authorView` 와 `userView` 가 따로 있는 것도 같은 이야기다. `userView` 는 `email` 을 담고 `GET /me` 에만 쓰인다.

```ts
export function postListItemView(post: PostListRow) {
  return {
    id: post.id,
    title: post.title,
    author: post.author,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
  };
}
```

`body` 가 없다. 2.4 를 지킨 것이고 이유는 응답 크기다 — 본문이 2KB 인 글 20개면 40KB 를 매번 보낸다.
`async` 도 없다. 저장소가 `PostListRow`(글 + `author` + `commentCount`)로 들고 온 값에서 모양만 고르기
때문이다. 7.7 전에는 이 함수가 글마다 작성자와 댓글 수를 따로 물어봤다.

### 목록 한 번에 쿼리가 몇 번 나가는가 (4단계 실측)

항목 하나마다 **작성자 조회**와 **댓글 수 세기**가 붙던 시절의 값이다. 그런데 실제로 나간 쿼리는 항목당
2회가 아니었다.

| 글 | 1건 | 5건 | 10건 | 20건 |
|---|---|---|---|---|
| 쿼리 | 3회 | 7회 | 12회 | 22회 |

내역은 `posts` 1 + `users` 1 + 글마다 `COUNT` 1, 즉 **2 + N** 이다. 라우터가
`Promise.all(page.items.map(postListItemView))` 로 항목을 한꺼번에 시작하므로 `users.findById` 호출들이
같은 시점에 모이고 **Prisma 가 그것을 `IN (...)` 한 번으로 묶었다.** `COUNT` 는 묶이지 않아 글 수만큼
그대로 나갔다 — 4.6 에서 센 N+1 은 이 `COUNT` 쪽이고, 7.7 에서 없앴다(아래).

```ts
export function listView<T>(page: { items: T[]; nextCursor: string | null; hasNext: boolean }) {
  return { items: page.items, pageInfo: { nextCursor: page.nextCursor, hasNext: page.hasNext } };
}
```

이 파일에서 `async` 가 아닌 함수는 이것과 `postListItemView` 둘이다. 둘 다 저장소를 부르지 않기
때문이다. 글 목록과 댓글 목록이 같은 함수를 써서 `pageInfo` 의 키 이름이 갈라질 수 없고, 8.6 의
`useInfiniteQuery` 가 `pageInfo.nextCursor` 를 그대로 읽는다.

## 왜 이렇게 했는가

1. **조립을 라우터에서 뺀 것.** 글 상세를 돌려주는 곳이 셋인데 각각 객체 리터럴로 적혀 있으면
   `updatedAt` 을 한 곳에만 추가하는 날이 온다.
2. **반환 타입을 추론에 맡긴 것.** 함수 본문이 그 자체로 명세다. 8단계에서 다시 본다.
3. **`commentCount` 를 목록에 남긴 것.** 빼면 `COUNT` 가 사라지지만 2.6 의 "첫 화면에 호출 한 번" 이 먼저다. 쿼리 20번과 HTTP 요청 20번 중 전자를 골랐고, 7.7 에서 전자도 없앴다.

## 3단계에서 무엇이 바뀌었나

커리큘럼 4.5 는 "저장소만 교체한다. 라우터와 상태 코드는 한 줄도 건드리지 않는다" 고 적었다.
**지켜지지 않았고, 이 파일이 그 진앙이다.** 3단계 끝과 파일 해시를 비교하면 라우터 3개와
`views.ts` 가 바뀌었고 그대로인 것은 `respond.ts` 하나다. 이 파일에서 바뀐 것은 둘이다.

- 저장소를 부르는 함수 5개(`authorView`·`userView`·`commentView`·`postListItemView`·
  `postDetailView`)가 전부 `async` 가 됐다. `listView` 만 동기로 남았다.
- 댓글 목록 조립이 `await Promise.all(commentPage.items.map(commentView))` 가 됐다.

**상태 코드와 분기는 그대로다.** 4단계를 마친 시점의 `fail()` 분포는 `400` 9회, `401` 1회,
`403` 3회, `404` 6회, `409` 1회, `422` 4회이고 `docs/02-api.md` 2.2 표와 일치한다.
3단계에 써 둔 회귀 검사 36가지를 DB 위에서 다시 돌려 **36 통과 · 0 실패**였다.

원인은 하나다. **3단계 저장소를 동기 함수로 만들었기 때문이다.** DB 는 원격이라 조회가 기다림이 되고,
`users.findById(id)` 가 `await users.findById(id)` 가 되면 그것을 부르는 뷰 함수가 `async` 가 되고,
뷰가 `async` 가 되니 라우터 핸들러도 전부 `async` 가 됐다. 저장소에서 뷰로, 뷰에서 라우터로 번진다.

**교훈:** 저장소가 언젠가 원격이 될 것을 안다면 경계를 처음부터 비동기로 둔다. `Map` 을 쓰더라도
`async findById()` 로 감쌌으면 이 파일도 라우터도 한 줄도 안 바뀌었다. 반환 타입이 `User | null` 에서
`Promise<User | null>` 로 바뀌는 순간 다른 경계다.

## 7단계에서 무엇이 바뀌었나

이번에는 반대 방향이다. `postListItemView` 가 `async` 를 **뗐다.** 글 1만 건 · 댓글 5만 건 · 유저
20명에서 `GET /posts` 한 번에 나가는 쿼리를 세면 이렇다.

| 목록 글 수 | 7.7 전 | 7.7 후 |
|---|---|---|
| 1건 | 3회 | **2회** |
| 20건 | 22회 | **2회** |
| 50건 | 52회 | **2회** |

글 수와 무관하게 2회다. 내역은 ① 글 + 댓글 수 집계 — `_count` 가 `LEFT JOIN` 으로 접혀 들어간다
② 작성자 `WHERE id IN (...)` 이다.

**왜 1회가 아닌가.** 작성자까지 JOIN 으로 접으려면 Prisma 의 `relationLoadStrategy: "join"` 이 필요한데
이 프로젝트가 쓰는 **Prisma 7.10.0 에는 그 옵션이 없다.** 넣어 보니 타입에 존재하지 않았다. 그래서
작성자는 별도 `IN (...)` 한 번으로 남았고, 중요한 것은 그 횟수가 글 수를 따라 늘지 않는다는 것이다.

`N+1` 은 "쿼리를 몇 번 쓰느냐" 가 아니라 **"쿼리 수가 행 수를 따라 늘어나느냐"** 의 문제다. 2회는
상수이고 52회는 상수가 아니다.

## 직접 해 볼 것

1. `postListItemView` 에 `body: post.body` 를 추가하고 `GET /posts` 를 호출해 2.4 의 예시와 대조한다.
   명세와 코드가 갈라지는 순간이 한 줄이다. 되돌린다.
2. `userView` 의 본문을 `return user;` 로 바꾸고 가입을 호출한다 → `password` 가 그대로 나온다. 되돌린다.
3. Prisma 를 `log: ["query"]` 로 켜고 `GET /posts?limit=20` 을 한 번 부른다 → 로그가 2줄이다.
   첫 줄에 `LEFT JOIN` 과 `COUNT` 가, 둘째 줄에 `IN (...)` 이 있는 것을 눈으로 확인한다.
4. `store/posts.ts` 의 `include` 에서 `_count` 를 지우고, 이 파일에서 `commentCount` 를
   `await comments.countByPostId(post.id)` 로 되돌린다 → 로그가 22줄이 된다. 되돌린다.

## 다음 단계에서 어떻게 바뀌는가

| 단계 | 바뀌는 것 |
|---|---|
| 4.5 | **끝났다.** 뷰 함수 5개가 `async` 가 됐고, 그 여파로 라우터 3개도 같이 바뀌었다 |
| 4.6 | **끝났다.** 목록 한 번에 `2 + N` 회를 실측했다. 남은 N 은 `COUNT` 였다 |
| 6.1 | `User.password` 가 `passwordHash` 로 바뀌어도 이 파일은 그 필드를 안 읽어 고칠 줄이 없다 |
| 7.7 | **끝났다.** `_count` 를 저장소에서 받아 `2 + N` 이 글 수와 무관한 2회가 됐다 |
