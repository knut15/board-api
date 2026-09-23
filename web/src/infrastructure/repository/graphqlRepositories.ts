// 문서: docs/code/web-graphql.md · 레이어: infrastructure
//
// 포트 구현. 유스케이스가 부르는 모양(application/ports)과 GraphQL 응답 모양을 잇는다.

import type {
  AuthGateway,
  CommentRepository,
  PostRepository,
} from "@/application/ports/repositories";
import type { Page, Post, PostSummary } from "@/domain/post/entity";
import type { Comment } from "@/domain/comment/entity";
import type { User } from "@/domain/user/entity";
import * as doc from "../graphql/documents";
import { loginRequest, logoutRequest, refreshRequest } from "../auth/authApi";

type Request = <T>(document: string, variables?: object) => Promise<T>;

export function createPostRepository(request: Request): PostRepository {
  return {
    async list(params) {
      // GraphQL enum 은 콜론을 못 쓴다. createdAt:desc 를 createdAt_desc 로 바꿔 보낸다.
      const d = await request<{ posts: Page<PostSummary> }>(doc.POSTS_QUERY, {
        ...params,
        sort: params.sort?.replace(":", "_"),
      });
      return d.posts;
    },
    async findById(id) {
      const d = await request<{ post: Post }>(doc.POST_QUERY, { id });
      return d.post;
    },
    async create(input) {
      const d = await request<{ createPost: Post }>(doc.CREATE_POST, input);
      return d.createPost;
    },
    async update(id, patch) {
      const d = await request<{ updatePost: Post }>(doc.UPDATE_POST, { id, ...patch });
      return d.updatePost;
    },
    async remove(id) {
      await request(doc.DELETE_POST, { id });
    },
  };
}

export function createCommentRepository(request: Request): CommentRepository {
  return {
    async listByPost(params) {
      const d = await request<{ comments: Page<Comment> }>(doc.COMMENTS_QUERY, params);
      return d.comments;
    },
    async create(input) {
      const d = await request<{ addComment: Comment }>(doc.ADD_COMMENT, input);
      return d.addComment;
    },
    async remove(id) {
      await request(doc.DELETE_COMMENT, { id });
    },
  };
}

export function createAuthGateway(request: Request): AuthGateway {
  return {
    async signup(input) {
      const d = await request<{ signup: User }>(doc.SIGNUP, input);
      return d.signup;
    },
    // 로그인과 재발급만 GraphQL 을 거치지 않는다. 응답에 실려 오는 Set-Cookie 를
    // 브라우저가 받아야 하는데, 그 일은 REST 한 겹이 훨씬 단순하게 한다.
    login: loginRequest,
    refresh: refreshRequest,
    logout: logoutRequest,
    async me() {
      const d = await request<{ me: User }>(doc.ME_QUERY);
      return d.me;
    },
  };
}
