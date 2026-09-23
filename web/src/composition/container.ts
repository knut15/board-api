// 문서: docs/code/web-composition.md · 레이어: composition
//
// 조립 지점. **infrastructure 를 아는 유일한 곳**이다.
// presentation 은 여기서 나온 함수만 부르고, 그 함수가 GraphQL 로 가는지 REST 로 가는지 모른다.

import { createGraphqlClient } from "@/infrastructure/graphql/client";
import { browserTokenStorage } from "@/infrastructure/auth/tokenStorage";
import { refreshRequest } from "@/infrastructure/auth/authApi";
import {
  createAuthGateway,
  createCommentRepository,
  createPostRepository,
} from "@/infrastructure/repository/graphqlRepositories";
import * as postUseCase from "@/application/usecase/posts";
import * as commentUseCase from "@/application/usecase/comments";
import * as authUseCase from "@/application/usecase/auth";

// 재발급은 GraphQL 클라이언트가 401 을 만났을 때 스스로 부른다.
// 여기서 잇는 이유는 클라이언트가 authApi 를 직접 import 하면 서로를 부르게 되기 때문이다.
const refresh = async (): Promise<boolean> => {
  try {
    const { token } = await refreshRequest();
    browserTokenStorage.set(token);
    return true;
  } catch {
    browserTokenStorage.clear();
    return false;
  }
};

const request = createGraphqlClient(browserTokenStorage, refresh);
const posts = createPostRepository(request);
const comments = createCommentRepository(request);
const auth = createAuthGateway(request);

export const tokens = browserTokenStorage;

export const api = {
  listPosts: postUseCase.listPosts(posts),
  getPost: postUseCase.getPost(posts),
  createPost: postUseCase.createPost(posts),
  editPost: postUseCase.editPost(posts),
  deletePost: postUseCase.deletePost(posts),

  listComments: commentUseCase.listComments(comments),
  addComment: commentUseCase.addComment(comments),
  deleteComment: commentUseCase.deleteComment(comments),

  signup: authUseCase.signup(auth),
  login: authUseCase.login(auth, browserTokenStorage),
  logout: authUseCase.logout(browserTokenStorage),
  getMe: authUseCase.getMe(auth),
};
