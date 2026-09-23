# 1단계 — 주제와 도메인

출처: 아티팩트 "게시판 API 서버, 설계부터 배포까지" 1단계
<https://claude.ai/artifact/WffCicExjmUU5R7yfvba1H>

만들 것을 명사와 관계로 고정한 문서다. 뒤의 여덟 단계가 전부 여기에 기댄다.
여기를 고치면 2단계 엔드포인트 표와 4단계 스키마를 같이 고쳐야 한다.

## 무엇을 만드는가 (1.1)

세 문장으로 쓴 서비스 설명이다. 여기서 명사만 추린 것이 리소스다.

1. 사람이 **가입**하고 **로그인**한다.
2. 로그인한 사람이 **글**을 쓰고, 자기 글만 고치거나 지운다.
3. 로그인한 사람이 남의 글에 **댓글**을 단다.

굵은 명사 중 리소스가 되는 것은 셋이다 — **유저 · 글 · 댓글**. 가입과 로그인은 행위라
리소스가 아니고, `/auth/*` 경로로 따로 뺀다(2단계에서 확정).

## 관계 (1.2)

전부 1:N 이다. N:M 은 이번 프로젝트에 없다 — 중간 테이블은 지금 배울 것이 아니다.

```
users  1 ──< posts       한 사람이 여러 글을 쓴다
posts  1 ──< comments    한 글에 여러 댓글이 달린다
users  1 ──< comments    한 사람이 여러 댓글을 쓴다
```

댓글은 글과 작성자 양쪽에서 1:N 을 받는다. 즉 `comments` 는 외래키를 두 개 갖는다.

## 필드 (1.3)

여기 적은 것이 4단계에서 그대로 테이블이 된다.

### users

| 필드 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `id` | uuid | PK | `crypto.randomUUID()` |
| `email` | text | UNIQUE, NOT NULL | 중복 가입은 409 |
| `passwordHash` | text | NOT NULL | argon2. 평문은 어디에도 두지 않는다 |
| `nickname` | text | NOT NULL | 목록·상세 응답에 실린다 |
| `createdAt` | timestamptz | NOT NULL | |

### posts

| 필드 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `id` | uuid | PK | |
| `authorId` | uuid | FK → `users.id`, NOT NULL | 소유권 검사의 기준 |
| `title` | text | NOT NULL | 길이 상한은 5단계에서 zod 로 |
| `body` | text | NOT NULL | |
| `createdAt` | timestamptz | NOT NULL | 기본 정렬 키. 7단계에서 인덱스 대상 |
| `updatedAt` | timestamptz | NOT NULL | PATCH 때 갱신 |

### comments

| 필드 | 타입 | 제약 | 비고 |
|---|---|---|---|
| `id` | uuid | PK | |
| `postId` | uuid | FK → `posts.id`, NOT NULL | 글 삭제 시 동작은 4.3 에서 정한다 |
| `authorId` | uuid | FK → `users.id`, NOT NULL | 소유권 검사의 기준 |
| `body` | text | NOT NULL | |
| `createdAt` | timestamptz | NOT NULL | |

`updatedAt` 은 `posts` 에만 둔다. 댓글 수정 엔드포인트가 없기 때문이다(아래 "안 만들 것").

## 안 만들 것 (1.4)

지금 적어서 빼 둔다. 4주차에 흔들리지 않기 위한 목록이고, **막히면 여기에 한 줄 추가하고
다음 단계로 간다.**

1. 좋아요 / 추천
2. 파일 업로드 · 이미지 첨부
3. 알림 (이메일, 푸시, 인앱)
4. 관리자 화면 · 권한 등급 (역할은 "소유자냐 아니냐" 둘뿐이다)
5. 소셜 로그인 (OAuth)
6. 태그 · 팔로우 — N:M 이라 1.2 에서 뺐다
7. 대댓글 (댓글의 댓글)
8. 댓글 수정 — 삭제만 있다
9. 글 수정 이력 · 임시 저장

### 나중에 추가한 것

막혀서 줄인 범위를 여기에 날짜와 함께 적는다.

<!-- 예: 2026-10-02 — 7.5 본문 검색. 제목 검색만 남긴다. -->

## 이 단계의 통과 조건

- [x] 리소스 3개, 관계 3개, 필드 표가 이 문서 한 장에 있다
- [x] 안 만들 것 목록이 5개 이상이다 (9개)
- [x] 완성 시나리오 다섯 줄이 파일로 있다 → [scenarios.md](./scenarios.md)
