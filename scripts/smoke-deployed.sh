#!/usr/bin/env bash
# 문서: docs/14-verification.md · 커리큘럼 9.7
#
# 배포 직후 "정말 올라갔는가" 만 본다. 5가지, **아무것도 쓰지 않는다.**
#
#   ./scripts/smoke-deployed.sh
#   ./scripts/smoke-deployed.sh https://다른-배포본.example.com
#
# verify-deployed.sh 와 나눈 이유가 여기 있다. 그쪽은 계정과 글을 만든다 —
# 배포할 때마다 돌면 운영 데이터가 검사 찌꺼기로 찬다.
# 이 검사는 읽기만 하므로 자동 배포 뒤에 매번 돌려도 된다.
#
# 플랫폼의 헬스체크로는 모자라다. 그건 컨테이너가 떴는지만 본다 —
# 브라우저 → BFF → Express → Postgres 전 구간이 이어졌는지는 불러 봐야 안다.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

SITE="${1:-${BOARD_SITE_URL:-https://web-production-76a42.up.railway.app}}"
echo "대상: $SITE"
echo

status() { curl -s -o /dev/null -m 30 -w '%{http_code}' "$1"; }

chk "화면이 뜬다" "200" "$(status "$SITE/")"
chk "명세 화면이 뜬다" "200" "$(status "$SITE/docs")"
chk "명세 원문을 준다" "200" "$(status "$SITE/docs/openapi.yaml")"

# 읽기 질의 하나. 전 구간이 이어져 있으면 items 가 배열로 온다.
# 글이 없어도 빈 배열이라 통과한다 — 여기서 보는 것은 데이터가 아니라 길이다.
r=$(curl -s -m 30 -X POST "$SITE/api/graphql" -H "$JSON" \
  -d '{"query":"{ posts(limit: 1) { items { id } } }"}')
chk "BFF → Express → Postgres" "array" "$(echo "$r" | pick '.data.posts.items' | grep -q '^\[\?' && echo array || echo "$r")"

# 로그인 안 한 사람이 글을 쓰려 하면 막혀야 한다. 인증이 살아 있는지 한 줄로 본다.
NOAUTH='{"query":"mutation($t:String!,$b:String!){ createPost(title:$t, body:$b){ id } }","variables":{"t":"x","b":"y"}}'
chk "인증이 살아 있다" "UNAUTHENTICATED" \
  "$(curl -s -m 30 -X POST "$SITE/api/graphql" -H "$JSON" -d "$NOAUTH" | pick '.errors[0].extensions.code')"

summary
