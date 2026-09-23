#!/usr/bin/env bash
# 문서: docs/14-verification.md · 커리큘럼 6.8
#
# 6단계 검사 24가지. 완성 시나리오 다섯 줄과, 인증·권한이 실제로 갈리는지를 본다.
#
#   ./scripts/verify-auth.sh
#
# ⚠ **이 검사는 users · posts · comments 를 비운다.**
# 해시가 계정마다 다른지(salt), 토큰 페이로드에 무엇이 들어 있는지를 세려면
# 아는 데이터만 있어야 한다. 7단계 측정용 시드를 넣어 둔 상태에서 돌리면 사라진다 —
# 실제로 두 번 겪었다. 측정 중에는 돌리지 않는다.
#
# 끝난 뒤 시드를 되돌리려면:
#   cd server && pnpm exec tsx prisma/7.1-seed.ts

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_local
$PSQL 'TRUNCATE users, posts, comments CASCADE;' > /dev/null

echo "== 1.5 완성 시나리오 다섯 줄 =="
chk "1 가입한다" 201 "$(code -X POST "$API/auth/signup" -H "$JSON" \
  -d '{"email":"kim@example.com","password":"password123","nickname":"kim"}')"
chk "  응답에 비밀번호가 없다" "yes" "$(grep -qE 'password|hash' "$BODY" && echo no || echo yes)"

chk "2 로그인해 토큰을 받는다" 200 "$(code -X POST "$API/auth/login" -H "$JSON" -c "$COOKIES" \
  -d '{"email":"kim@example.com","password":"password123"}')"
A=$(from_body '.token')

chk "3 글을 쓴다" 201 "$(code -X POST "$API/posts" -H "$JSON" -H "Authorization: Bearer $A" \
  -d '{"title":"완성 시나리오","body":"본문"}')"
P=$(from_body '.id')

code -X POST "$API/auth/signup" -H "$JSON" \
  -d '{"email":"lee@example.com","password":"password123","nickname":"lee"}' > /dev/null
code -X POST "$API/auth/login" -H "$JSON" \
  -d '{"email":"lee@example.com","password":"password123"}' > /dev/null
B=$(from_body '.token')

chk "4 남의 글에 댓글을 단다" 201 "$(code -X POST "$API/posts/$P/comments" -H "$JSON" \
  -H "Authorization: Bearer $B" -d '{"body":"댓글"}')"
chk "5 남의 글을 고치려다 실패한다" 403 "$(code -X PATCH "$API/posts/$P" -H "$JSON" \
  -H "Authorization: Bearer $B" -d '{"title":"뺏는다"}')"
chk "  글 내용이 바뀌지 않았다" "완성 시나리오" "$(curl -s "$API/posts/$P" | pick '.title')"

echo "== 6.5 401 과 403 을 가르는가 =="
chk "토큰 없이 글 쓰기" 401 "$(code -X POST "$API/posts" -H "$JSON" -d '{"title":"x","body":"y"}')"
chk "  code 가 UNAUTHENTICATED" "UNAUTHENTICATED" "$(from_body '.error.code')"
chk "남의 글 수정" 403 "$(code -X PATCH "$API/posts/$P" -H "$JSON" \
  -H "Authorization: Bearer $B" -d '{"title":"x"}')"
chk "  code 가 FORBIDDEN" "FORBIDDEN" "$(from_body '.error.code')"

# 만료된 토큰은 기다려서 만들 수 없다. 과거 시각으로 서명해 만든다.
EXPIRED=$(cd server && pnpm exec tsx -e "
import('./src/env.ts').then(()=>import('jose')).then(async ({SignJWT})=>{
  const key = new TextEncoder().encode(process.env.JWT_SECRET);
  console.log(await new SignJWT({typ:'access'}).setProtectedHeader({alg:'HS256'})
    .setSubject('00000000-0000-0000-0000-000000000000')
    .setIssuedAt(Math.floor(Date.now()/1000) - 7200)
    .setExpirationTime(Math.floor(Date.now()/1000) - 3600).sign(key));
});" 2>/dev/null | tail -1)
chk "만료된 토큰" 401 "$(code "$API/me" -H "Authorization: Bearer $EXPIRED")"

# 서명의 마지막 글자는 비트를 2개만 담는다. 한 글자를 바꿔도 같은 바이트로 디코드될 수 있어
# "끝 글자 하나 바꾸기" 로는 위조를 검사하지 못한다 — 실제로 그 테스트가 통과해서 속았다.
# 서버가 모르는 키로 서명한 토큰을 만든다.
FORGED=$(cd server && pnpm exec tsx -e "
import('jose').then(async ({SignJWT})=>{
  const key = new TextEncoder().encode('이것은-서버가-모르는-키-0123456789abcdef');
  console.log(await new SignJWT({typ:'access'}).setProtectedHeader({alg:'HS256'})
    .setSubject('00000000-0000-0000-0000-000000000000')
    .setIssuedAt().setExpirationTime('15m').sign(key));
});" 2>/dev/null | tail -1)
chk "남의 키로 서명한 토큰" 401 "$(code "$API/me" -H "Authorization: Bearer $FORGED")"
chk "서명 본문을 두 글자 지운 토큰" 401 "$(code "$API/me" -H "Authorization: Bearer ${A%??}")"

echo "== 6.1 DB 에 평문이 없는가 =="
HASH=$($PSQL "select \"passwordHash\" from users where email='kim@example.com'")
chk "argon2id 해시로 저장됐다" "yes" "$(echo "$HASH" | grep -q '^\$argon2id\$' && echo yes || echo no)"
chk "평문 password123 이 users 에 없다" "0" \
  "$($PSQL "select count(*) from users where \"passwordHash\" like '%password123%'")"
chk "두 계정의 해시가 서로 다르다 (salt)" "2" \
  "$($PSQL 'select count(distinct "passwordHash") from users')"

echo "== 6.3 토큰 페이로드에 무엇이 들어 있는가 =="
chk "sub·exp·iat·typ 만 들어 있다" "exp,iat,sub,typ" \
  "$(node -e "console.log(Object.keys(JSON.parse(Buffer.from('$A'.split('.')[1],'base64url'))).sort().join(','))")"
chk "이메일이 페이로드에 없다" "0" \
  "$(node -e "console.log(Buffer.from('$A'.split('.')[1],'base64url').toString().includes('kim@example.com')?1:0)")"

echo "== 6.7 · 9 리프레시와 로그아웃 =="
chk "로그인이 httpOnly 쿠키를 심었다" "yes" \
  "$(grep -q 'HttpOnly.*refresh_token' "$COOKIES" && echo yes || echo no)"
chk "쿠키로 재발급" 200 "$(code -X POST "$API/auth/refresh" -b "$COOKIES" -c "$COOKIES")"
chk "  새 액세스 토큰이 동작한다" 200 "$(code "$API/me" -H "Authorization: Bearer $(from_body '.token')")"
chk "쿠키 없이 재발급" 401 "$(code -X POST "$API/auth/refresh")"
chk "액세스 토큰으로 재발급 시도" 401 "$(code -X POST "$API/auth/refresh" --cookie "refresh_token=$A")"
chk "로그아웃" 204 "$(code -X POST "$API/auth/logout" -b "$COOKIES" -c "$COOKIES")"
chk "  로그아웃 뒤 재발급이 막힌다" 401 "$(code -X POST "$API/auth/refresh" -b "$COOKIES")"
chk "쿠키 없이 로그아웃해도 성공" 204 "$(code -X POST "$API/auth/logout")"

summary
