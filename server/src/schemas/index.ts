// 문서: docs/code/schemas.md · 커리큘럼 5.1 · 5.3
//
// 요청 스키마를 엔드포인트 단위로 모은다. 이름을 엔드포인트에 맞춰
// CreatePostBody · ListPostsQuery 처럼 짓는다 — 어디에 쓰이는지가 이름에 있다.
//
// 타입은 여기서 z.infer 로 뽑는다(5.3). 타입을 따로 선언하면 언젠가 스키마와 갈라진다.

import { z } from "zod";

// ---- 공통 조각 -------------------------------------------------------------

// 쿼리 파라미터는 언제나 문자열로 온다. 숫자로 쓰려면 바꿔 줘야 한다.
// z.coerce 를 쓰면 ""(빈 문자열)이 0 으로 바뀌어 통과하므로, 문자열을 먼저 검사한 뒤 바꾼다.
const intFromQuery = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, "정수여야 합니다.")
    .transform(Number)
    .refine((n) => n >= min && n <= max, `${min} 이상 ${max} 이하여야 합니다.`);

const uuid = z.uuid("uuid 형식이어야 합니다.");

export const IdParams = z.object({ id: uuid });
export const PostIdParams = z.object({ postId: uuid });

// 목록 공통 — limit 과 cursor
// 7.4 에서 .loose() 를 .strict() 로 조였다. 모르는 파라미터를 조용히 무시하면
// 오타(?sortt=...)가 "정렬이 안 먹네" 로 나타나고 원인을 찾기 어렵다.
export const PageQuery = z
  .object({
    limit: intFromQuery(1, 50).optional(),
    cursor: z.string().optional(),
  })
  .strict();

// 7.4 — 정렬 허용 목록.
// **사용자 입력을 그대로 orderBy 에 넣지 않는다.** 넣으면 없는 컬럼 이름으로 DB 가 죽거나,
// 인덱스가 없는 컬럼으로 정렬해 목록이 통째로 느려진다.
// enum 으로 박아 두면 검증과 허용 목록이 한 곳에서 끝나고, 목록 밖은 400 이 된다.
export const SORT_KEYS = ["createdAt:desc", "createdAt:asc"] as const;
export const SortQuery = z.enum(SORT_KEYS).optional();

// ---- auth ------------------------------------------------------------------

export const SignupBody = z
  .object({
    email: z.email("이메일 형식이어야 합니다."),
    password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다."),
    nickname: z.string().trim().min(1, "닉네임을 입력해 주세요.").max(20),
  })
  .strict();

export const LoginBody = z
  .object({
    // 로그인에서는 email 형식을 따지지 않는다. 형식 오류로 400 을 돌려주면
    // 그 자체가 "이 값은 이메일이 아니다" 라는 정보가 되고, 401 하나로 답하기로 한 규칙(6.2)과 어긋난다.
    email: z.string(),
    password: z.string(),
  })
  .strict();

// ---- posts -----------------------------------------------------------------

export const TITLE_MAX = 200;
export const BODY_MAX = 50_000;

export const CreatePostBody = z
  .object({
    title: z.string().trim().min(1, "제목을 입력해 주세요.").max(TITLE_MAX),
    body: z.string().trim().min(1, "본문을 입력해 주세요.").max(BODY_MAX),
  })
  .strict();

// PATCH 는 부분 수정이다. 안 보낸 필드는 건드리지 않는다.
export const UpdatePostBody = CreatePostBody.partial().refine(
  (v) => v.title !== undefined || v.body !== undefined,
  "고칠 내용을 하나는 보내야 합니다.",
);

// 7.5 — 필터. 셋 다 선택이다.
export const ListPostsQuery = PageQuery.extend({
  sort: SortQuery,
  q: z.string().trim().min(1).max(100).optional(),
  authorId: uuid.optional(),
}).strict();

// ---- comments --------------------------------------------------------------

export const COMMENT_MAX = 1_000;

export const CreateCommentBody = z
  .object({
    body: z.string().trim().min(1, "댓글을 입력해 주세요.").max(COMMENT_MAX),
  })
  .strict();

export const ListCommentsQuery = PageQuery;
export type SortKey = (typeof SORT_KEYS)[number];

// ---- 타입 (5.3) ------------------------------------------------------------

export type CreatePostBody = z.infer<typeof CreatePostBody>;
export type UpdatePostBody = z.infer<typeof UpdatePostBody>;
export type ListPostsQuery = z.infer<typeof ListPostsQuery>;
export type CreateCommentBody = z.infer<typeof CreateCommentBody>;
export type ListCommentsQuery = z.infer<typeof ListCommentsQuery>;
export type SignupBody = z.infer<typeof SignupBody>;
export type LoginBody = z.infer<typeof LoginBody>;
export type IdParams = z.infer<typeof IdParams>;
export type PostIdParams = z.infer<typeof PostIdParams>;
