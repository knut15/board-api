#!/usr/bin/env bash
# 문서: docs/14-verification.md · 커리큘럼 5.6
#
# 3~5단계 검사 16가지. 잘못된 입력에 상태 코드가 맞는지, 그리고 응답이
# **에러 형태를 지키고 내부를 흘리지 않는지**를 본다.
#
#   ./scripts/verify-validation.sh
#
# DB 를 비우지 않는다. 계정과 글을 하나씩 만들고 그대로 둔다 —
# 여러 번 돌려도 같은 결과여야 한다.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# 이미 있으면 로그인, 없으면 가입한 뒤 로그인.
# 가입 응답에는 토큰이 없다(6단계) — 토큰은 로그인만 준다.
login() {
  curl -s -X POST "$API/auth/login" -H "$JSON" \
    -d '{"email":"gate@example.com","password":"password123"}' | pick '.token'
}

TOKEN=$(login)
if [ -z "$TOKEN" ]; then
  curl -s -o /dev/null -X POST "$API/auth/signup" -H "$JSON" \
    -d '{"email":"gate@example.com","password":"password123","nickname":"게이트"}'
  TOKEN=$(login)
fi
if [ -z "$TOKEN" ]; then
  echo "토큰을 받지 못했다. 서버가 $API 에 떠 있는지 확인한다." >&2
  exit 2
fi
AUTH="Authorization: Bearer $TOKEN"

POST_ID=$(curl -s -X POST "$API/posts" -H "$JSON" -H "$AUTH" \
  -d '{"title":"게이트용 글","body":"본문"}' | pick '.id')

# 상태 코드만 보지 않는다. 형태가 맞는지, 내부가 새지 않는지까지 한 번에 본다.
probe() { # probe <설명> <기대코드> <curl 인자...>
  local label="$1" want="$2"
  shift 2
  local status
  status=$(code "$@")

  local verdict
  verdict=$(node -e '
    const b = require(process.argv[1]);
    const e = b.error;
    // 에러 응답은 { error: { code, message, details } } 하나뿐이어야 한다.
    const okShape = e && typeof e.code === "string" && typeof e.message === "string"
      && ("details" in e) && Object.keys(b).length === 1;
    // 스택·드라이버 메시지·SQL·제약 이름이 밖으로 나가면 안 된다.
    const raw = JSON.stringify(b);
    const leak = /at .*\(|node_modules|prisma\.|PrismaClient|SELECT |FROM "public"|invalid input syntax|\bposts\b.*\bpkey\b|_fkey/.test(raw);
    console.log((okShape ? "shape-ok" : "shape-BAD") + " " + (leak ? "LEAK" : "clean") + " " + (e ? e.code : "-"));
  ' "$BODY" 2>/dev/null || echo "parse-BAD - -")

  if [ "$status" = "$want" ] && [[ "$verdict" == shape-ok* ]] && [[ "$verdict" != *LEAK* ]]; then
    printf "  ok   %-40s %s  %s\n" "$label" "$status" "$verdict"
    pass=$((pass + 1))
  else
    printf "  FAIL %-40s 기대 %s 실제 %s  %s\n" "$label" "$want" "$status" "$verdict"
    fail=$((fail + 1))
  fi
}

echo "== 잘못된 입력 12종 (400 과 422 를 가르는가) =="
probe "1 제목이 빈 문자열"        422 -X POST "$API/posts" -H "$JSON" -H "$AUTH" -d '{"title":"   ","body":"본문"}'
probe "2 제목이 숫자"             400 -X POST "$API/posts" -H "$JSON" -H "$AUTH" -d '{"title":123,"body":"본문"}'
probe "3 본문 누락"               400 -X POST "$API/posts" -H "$JSON" -H "$AUTH" -d '{"title":"제목"}'
probe "4 모르는 필드"             400 -X POST "$API/posts" -H "$JSON" -H "$AUTH" -d '{"title":"제목","body":"본문","pinned":true}'
probe "5 제목 201자"              422 -X POST "$API/posts" -H "$JSON" -H "$AUTH" -d "{\"title\":\"$(printf 'ㄱ%.0s' $(seq 201))\",\"body\":\"본문\"}"
probe "6 JSON 이 깨짐"            400 -X POST "$API/posts" -H "$JSON" -H "$AUTH" -d '{"title":'
probe "7 경로 id 가 uuid 아님"    400 "$API/posts/not-a-uuid"
probe "8 limit 이 숫자 아님"      400 "$API/posts?limit=abc"
probe "9 limit 범위 밖"           400 "$API/posts?limit=999"
probe "10 limit 이 빈 값"         400 "$API/posts?limit="
probe "11 PATCH 에 빈 바디"       422 -X PATCH "$API/posts/$POST_ID" -H "$JSON" -H "$AUTH" -d '{}'
probe "12 댓글 본문이 빈 문자열"  422 -X POST "$API/posts/$POST_ID/comments" -H "$JSON" -H "$AUTH" -d '{"body":"  "}'

echo "== 새어 나가면 안 되는 것 (Prisma 에러를 번역하는가) =="
probe "없는 글 (P2025 번역)"       404 "$API/posts/00000000-0000-0000-0000-000000000000"
probe "중복 이메일 (P2002 번역)"   409 -X POST "$API/auth/signup" -H "$JSON" -d '{"email":"gate@example.com","password":"password123","nickname":"둘"}'
probe "없는 경로"                  404 "$API/nope"
probe "토큰 없음"                  401 -X POST "$API/posts" -H "$JSON" -d '{"title":"x","body":"y"}'

summary
