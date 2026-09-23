// 문서: docs/code/web-graphql.md · 레이어: infrastructure
//
// 쿼리 문서를 한 파일에 모은다. 어떤 화면이 무엇을 요구하는지 여기만 보면 안다.
// 필드를 화면에 필요한 만큼만 적는 것이 GraphQL 을 쓰는 이유다 —
// 목록에서 body 를 요청하지 않으면 BFF 가 그 필드를 채우지 않는다.

const AUTHOR = `author { id nickname }`;

export const POSTS_QUERY = `
  query Posts($limit: Int, $cursor: String, $sort: PostSort, $q: String, $authorId: ID) {
    posts(limit: $limit, cursor: $cursor, sort: $sort, q: $q, authorId: $authorId) {
      items { id title ${AUTHOR} commentCount createdAt }
      pageInfo { nextCursor hasNext }
    }
  }
`;

export const POST_QUERY = `
  query Post($id: ID!) {
    post(id: $id) {
      id title body ${AUTHOR} commentCount createdAt updatedAt
      comments {
        items { id body ${AUTHOR} createdAt }
        pageInfo { nextCursor hasNext }
      }
    }
  }
`;

const POST_DETAIL_FIELDS = `
  id title body ${AUTHOR} commentCount createdAt updatedAt
  comments { items { id body ${AUTHOR} createdAt } pageInfo { nextCursor hasNext } }
`;

export const CREATE_POST = `
  mutation CreatePost($title: String!, $body: String!) {
    createPost(title: $title, body: $body) { ${POST_DETAIL_FIELDS} }
  }
`;

export const UPDATE_POST = `
  mutation UpdatePost($id: ID!, $title: String, $body: String) {
    updatePost(id: $id, title: $title, body: $body) { ${POST_DETAIL_FIELDS} }
  }
`;

export const DELETE_POST = `mutation DeletePost($id: ID!) { deletePost(id: $id) }`;

export const COMMENTS_QUERY = `
  query Comments($postId: ID!, $limit: Int, $cursor: String) {
    comments(postId: $postId, limit: $limit, cursor: $cursor) {
      items { id body ${AUTHOR} createdAt }
      pageInfo { nextCursor hasNext }
    }
  }
`;

export const ADD_COMMENT = `
  mutation AddComment($postId: ID!, $body: String!) {
    addComment(postId: $postId, body: $body) { id body ${AUTHOR} createdAt }
  }
`;

export const DELETE_COMMENT = `mutation DeleteComment($id: ID!) { deleteComment(id: $id) }`;

export const SIGNUP = `
  mutation Signup($email: String!, $password: String!, $nickname: String!) {
    signup(email: $email, password: $password, nickname: $nickname) { id email nickname createdAt }
  }
`;

export const LOGIN = `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user { id email nickname createdAt }
    }
  }
`;

export const ME_QUERY = `query Me { me { id email nickname createdAt } }`;
