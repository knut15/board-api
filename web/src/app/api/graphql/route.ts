// 문서: docs/code/web-bff.md · Next 서버에서 도는 BFF
//
// 스키마와 리졸버가 여기 있다. 리졸버는 도메인 규칙을 갖지 않는다 —
// Express REST 를 부르고 응답을 그대로 흘린다. 판정은 서버가 한다.

import { createSchema, createYoga } from "graphql-yoga";
import { callBoardApi } from "@/infrastructure/rest/boardApiClient";

type Ctx = { token: string | null };

const typeDefs = /* GraphQL */ `
  type Author {
    id: ID!
    nickname: String!
  }

  type User {
    id: ID!
    email: String!
    nickname: String!
    createdAt: String!
  }

  type PageInfo {
    nextCursor: String
    hasNext: Boolean!
  }

  type PostSummary {
    id: ID!
    title: String!
    author: Author!
    commentCount: Int!
    createdAt: String!
  }

  type Comment {
    id: ID!
    body: String!
    author: Author!
    createdAt: String!
  }

  type CommentPage {
    items: [Comment!]!
    pageInfo: PageInfo!
  }

  type PostPage {
    items: [PostSummary!]!
    pageInfo: PageInfo!
  }

  type Post {
    id: ID!
    title: String!
    body: String!
    author: Author!
    commentCount: Int!
    comments: CommentPage!
    createdAt: String!
    updatedAt: String!
  }

  type AuthResult {
    token: String!
    user: User!
  }

  enum PostSort {
    createdAt_desc
    createdAt_asc
  }

  type Query {
    posts(limit: Int, cursor: String, sort: PostSort, q: String, authorId: ID): PostPage!
    post(id: ID!): Post!
    comments(postId: ID!, limit: Int, cursor: String): CommentPage!
    me: User!
  }

  type Mutation {
    signup(email: String!, password: String!, nickname: String!): User!
    login(email: String!, password: String!): AuthResult!
    createPost(title: String!, body: String!): Post!
    updatePost(id: ID!, title: String, body: String): Post!
    deletePost(id: ID!): Boolean!
    addComment(postId: ID!, body: String!): Comment!
    deleteComment(id: ID!): Boolean!
  }
`;

// 쿼리 스트링을 만드는 작은 도우미. 값이 없는 파라미터는 아예 빼야
// 서버의 limit 검사(Number("") === 0 → 400)에 걸리지 않는다.
const qs = (params: Record<string, unknown>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  return entries.length ? `?${new URLSearchParams(entries as [string, string][])}` : "";
};

const resolvers = {
  Query: {
    posts: (
      _: unknown,
      a: { limit?: number; cursor?: string; sort?: string; q?: string; authorId?: string },
    ) =>
      // GraphQL enum 은 이름에 콜론을 못 쓴다. createdAt_desc 로 받아 REST 가 아는 모양으로 되돌린다.
      // 스키마 두 벌을 맞추는 비용이 BFF 를 얹은 값과 함께 따라온다.
      callBoardApi(
        `/posts${qs({ ...a, sort: a.sort?.replace("_", ":") })}`,
      ),
    post: (_: unknown, a: { id: string }) => callBoardApi(`/posts/${a.id}`),
    comments: (_: unknown, a: { postId: string; limit?: number; cursor?: string }) =>
      callBoardApi(`/posts/${a.postId}/comments${qs({ limit: a.limit, cursor: a.cursor })}`),
    me: (_: unknown, __: unknown, ctx: Ctx) => callBoardApi(`/me`, { token: ctx.token }),
  },
  Mutation: {
    signup: (_: unknown, a: object) => callBoardApi(`/auth/signup`, { method: "POST", body: a }),
    login: (_: unknown, a: object) => callBoardApi(`/auth/login`, { method: "POST", body: a }),
    createPost: (_: unknown, a: object, ctx: Ctx) =>
      callBoardApi(`/posts`, { method: "POST", body: a, token: ctx.token }),
    updatePost: (_: unknown, a: { id: string; title?: string; body?: string }, ctx: Ctx) =>
      callBoardApi(`/posts/${a.id}`, {
        method: "PATCH",
        body: { title: a.title, body: a.body },
        token: ctx.token,
      }),
    deletePost: async (_: unknown, a: { id: string }, ctx: Ctx) => {
      await callBoardApi(`/posts/${a.id}`, { method: "DELETE", token: ctx.token });
      // REST 는 204(바디 없음)로 답한다. GraphQL 은 값을 돌려줘야 하므로 여기서 true 로 바꾼다.
      return true;
    },
    addComment: (_: unknown, a: { postId: string; body: string }, ctx: Ctx) =>
      callBoardApi(`/posts/${a.postId}/comments`, {
        method: "POST",
        body: { body: a.body },
        token: ctx.token,
      }),
    deleteComment: async (_: unknown, a: { id: string }, ctx: Ctx) => {
      await callBoardApi(`/comments/${a.id}`, { method: "DELETE", token: ctx.token });
      return true;
    },
  },
};

const yoga = createYoga<{ request: Request }>({
  schema: createSchema({ typeDefs, resolvers }),
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
  context: ({ request }): Ctx => ({
    // 브라우저는 Authorization: Bearer <token> 으로 보내고,
    // BFF 가 Express 용 x-user-id 로 바꿔 넘긴다. 6단계에서 이 변환이 사라진다.
    token: request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null,
  }),
});

// Next 16 은 Route Handler 의 시그니처를 타입으로 검사한다.
// yoga 인스턴스를 그대로 내보내면 그 검사에 걸리므로 한 겹 감싼다.
export function GET(request: Request) {
  return yoga.handleRequest(request, { request });
}

export function POST(request: Request) {
  return yoga.handleRequest(request, { request });
}
