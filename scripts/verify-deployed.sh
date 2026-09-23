#!/usr/bin/env bash
# 문서: docs/14-verification.md · 커리큘럼 9.7
#
# 배포된 공개 URL 에서 완성 시나리오를 돌린다. 12가지.
#
#   ./scripts/verify-deployed.sh
#   ./scripts/verify-deployed.sh https://다른-배포본.example.com
#
# 로컬 검사와 다른 점이 둘이다.
#
# 1. **GraphQL 로 부른다.** 브라우저가 실제로 가는 길이 BFF 다. Express 를 직접 부르면
#    배포에서만 생기는 문제(내부 주소, 쿠키 Path 고쳐쓰기)를 건너뛰게 된다.
# 2. **DB 를 비우지 않는다.** 운영 데이터다. 계정 이메일에 실행 시각을 붙여
#    돌릴 때마다 새 계정을 만든다.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SITE="${1:-${BOARD_SITE_URL:-https://web-production-76a42.up.railway.app}}"
echo "대상: $SITE"
echo

gq() { # gq <요청 본문> [토큰]
  curl -s -m 30 -X POST "$SITE/api/graphql" -H "$JSON" \
    ${2:+-H "Authorization: Bearer $2"} -d "$1"
}

RUN=$(date +%s)
A="kim-$RUN@example.com"
B="lee-$RUN@example.com"

echo "== 1.5 완성 시나리오 — 공개 URL =="
r=$(gq "{\"query\":\"mutation{ signup(email:\\\"$A\\\",password:\\\"password123\\\",nickname:\\\"kim\\\"){ nickname } }\"}")
chk "1 가입한다" "kim" "$(echo "$r" | pick '.data.signup.nickname')"
chk "  응답에 비밀번호가 없다" "yes" "$(echo "$r" | grep -qiE 'password|hash' && echo no || echo yes)"

r=$(curl -s -m 30 -X POST "$SITE/api/auth/login" -H "$JSON" -c "$COOKIES" \
  -d "{\"email\":\"$A\",\"password\":\"password123\"}")
TA=$(echo "$r" | pick '.token')
chk "2 로그인해 토큰을 받는다" "3" "$(echo "$TA" | awk -F. '{print NF}')"
chk "  httpOnly 리프레시 쿠키" "yes" "$(grep -q '#HttpOnly' "$COOKIES" && echo yes || echo no)"

r=$(gq '{"query":"mutation{ createPost(title:\"공개 URL 에서 쓴 첫 글\",body:\"배포된 서버가 답한다.\"){ id title } }"}' "$TA")
P=$(echo "$r" | pick '.data.createPost.id')
chk "3 글을 쓴다" "공개 URL 에서 쓴 첫 글" "$(echo "$r" | pick '.data.createPost.title')"

gq "{\"query\":\"mutation{ signup(email:\\\"$B\\\",password:\\\"password123\\\",nickname:\\\"lee\\\"){ nickname } }\"}" > /dev/null
TB=$(curl -s -m 30 -X POST "$SITE/api/auth/login" -H "$JSON" \
  -d "{\"email\":\"$B\",\"password\":\"password123\"}" | pick '.token')

r=$(gq "{\"query\":\"mutation{ addComment(postId:\\\"$P\\\",body:\\\"남의 글에 다는 댓글\\\"){ body author { nickname } } }\"}" "$TB")
chk "4 남의 글에 댓글을 단다" "lee" "$(echo "$r" | pick '.data.addComment.author.nickname')"

r=$(gq "{\"query\":\"mutation{ updatePost(id:\\\"$P\\\",title:\\\"뺏는다\\\"){ id } }\"}" "$TB")
chk "5 남의 글을 고치려다 실패한다" "FORBIDDEN" "$(echo "$r" | pick '.errors[0].extensions.code')"
chk "  글 제목이 그대로다" "공개 URL 에서 쓴 첫 글" \
  "$(gq "{\"query\":\"{ post(id:\\\"$P\\\"){ title } }\"}" | pick '.data.post.title')"

echo "== 곁들인 실패 경로 =="
# 질의 문자열 안에 따옴표를 넣지 않는다. 변수로 넘기면 셸 따옴표와 겹치지 않는다 —
# 겹쳐서 GRAPHQL_PARSE_FAILED 가 났고 서버를 의심하느라 시간을 썼다.
NOAUTH='{"query":"mutation($t:String!,$b:String!){ createPost(title:$t, body:$b){ id } }","variables":{"t":"x","b":"y"}}'
chk "토큰 없이 글 쓰기" "UNAUTHENTICATED" "$(gq "$NOAUTH" | pick '.errors[0].extensions.code')"
chk "없는 글 조회" "POST_NOT_FOUND" \
  "$(gq '{"query":"{ post(id:\"00000000-0000-0000-0000-000000000000\"){ title } }"}' | pick '.errors[0].extensions.code')"
chk "쿠키로 토큰 재발급" "3" \
  "$(curl -s -m 30 -X POST "$SITE/api/auth/refresh" -b "$COOKIES" | pick '.token' | awk -F. '{print NF}')"

echo "== 명세 화면 =="
chk "GET /docs 가 Swagger UI 를 준다" "200" \
  "$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$SITE/docs")"

summary
