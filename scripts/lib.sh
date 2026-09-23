# 문서: docs/14-verification.md
#
# 검사 스크립트 넷이 함께 쓰는 것들. 직접 실행하지 않고 source 한다.

set -u

# 어디서 부르든 레포 루트에서 도는 것처럼 만든다.
# 경로를 상대로 적어 두면 "server/ 안에서 돌렸더니 안 되더라" 가 생긴다.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

API="${BOARD_API_URL:-http://localhost:4000}"
JSON="Content-Type: application/json"

# psql 을 노트북에 설치하지 않아도 되게 컨테이너 안의 것을 쓴다.
# 다른 DB 를 보려면 PSQL 을 넘긴다.
PSQL="${PSQL:-docker-compose -f server/compose.yaml exec -T db psql -U board -d board -tAc}"

# 응답 본문을 받아 두는 곳. 실행마다 새로 만들고 끝나면 지운다 —
# /tmp 에 고정 이름으로 두면 두 검사를 동시에 돌릴 때 서로 덮어쓴다.
TMP="$(mktemp -d)"
BODY="$TMP/body.json"
COOKIES="$TMP/cookies.txt"
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

# --- 결과 기록 -------------------------------------------------------------

chk() { # chk <설명> <기대> <실제>
  if [ "$2" = "$3" ]; then
    printf "  ok   %-46s %s\n" "$1" "$3"
    pass=$((pass + 1))
  else
    printf "  FAIL %-46s 기대 %s 실제 %s\n" "$1" "$2" "$3"
    fail=$((fail + 1))
  fi
}

summary() {
  echo
  echo "통과 $pass · 실패 $fail"
  # 실패가 있으면 0 이 아닌 값으로 끝난다. 사람 눈이 아니라 종료 코드로도 읽힌다.
  [ "$fail" -eq 0 ]
}

# --- HTTP ------------------------------------------------------------------

# 상태 코드를 찍고 본문은 $BODY 에 남긴다.
code() { curl -s -m 30 -o "$BODY" -w "%{http_code}" "$@"; }

# 표준입력의 JSON 에서 값 하나를 꺼낸다. 인자는 ".data.signup.nickname" 처럼 적는다.
#
# 없는 값은 **빈 문자열**로 낸다. ?? "" 가 없으면 console.log 가 "undefined" 라는
# 다섯 글자를 찍고, 받는 쪽은 그것을 값이 있는 것으로 읽는다.
# 로그인이 실패했는데 토큰을 받았다고 판단해 뒤따르는 검사가 전부 401 로 무너졌다.
pick() {
  node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
    try { const v = eval("("+d+")")'"$1"'; console.log(v ?? "") } catch { console.log("") }
  })'
}

# $BODY 에서 값 하나를 꺼낸다.
from_body() { pick "$1" < "$BODY"; }

# --- 안전 장치 -------------------------------------------------------------

# 데이터를 지우는 검사는 이것을 먼저 부른다.
# 운영 주소를 BOARD_API_URL 에 넣은 채 돌리는 사고를 막는다.
require_local() {
  case "$API" in
    http://localhost:*|http://127.0.0.1:*) ;;
    *)
      echo "이 검사는 DB 를 비운다. 로컬이 아닌 주소에서는 돌리지 않는다 — $API" >&2
      exit 2
      ;;
  esac
}
