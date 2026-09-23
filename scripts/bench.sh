#!/usr/bin/env bash
# 문서: docs/14-verification.md · 커리큘럼 7.2 · 7.6
#
# 목록 응답 시간을 잰다. 7단계에서 "느려 봐야 배운다" 를 하려고 쓴 도구다.
#
#   ./scripts/bench.sh
#   BOARD_API_URL=http://localhost:4000 ./scripts/bench.sh
#
# ⚠ 재기 전에 글 1만 건을 넣어 둔다. 비어 있으면 무엇을 재도 빠르다.
#     cd server && pnpm exec tsx prisma/7.1-seed.ts
#
# ⚠ 재는 동안 verify-auth.sh 를 돌리지 않는다. 그 검사가 DB 를 비운다.

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

RUNS="${RUNS:-15}"

# 한 번만 재면 그때의 잡음을 재게 된다. 여러 번 재서 중앙값을 낸다 —
# 평균이 아니라 중앙값인 이유는 가끔 끼는 큰 값 하나가 평균을 끌고 가기 때문이다.
bench() { # bench <설명> <경로>
  local label="$1" path="$2"
  local times=()

  # 첫 요청은 버린다. 연결을 맺고 캐시를 데우는 비용이 섞여 있다.
  curl -s -o /dev/null "$API$path"

  for _ in $(seq "$RUNS"); do
    times+=("$(curl -s -o /dev/null -w '%{time_total}' "$API$path")")
  done

  node -e '
    const t = process.argv.slice(2).map(Number).map(x => x * 1000).sort((a, b) => a - b);
    const mid = t[Math.floor(t.length / 2)];
    console.log(`  ${process.argv[1].padEnd(30)} 중앙값 ${mid.toFixed(1).padStart(7)} ms   (최소 ${t[0].toFixed(1)} · 최대 ${t.at(-1).toFixed(1)})`);
  ' "$label" "${times[@]}"
}

echo "대상: $API   (${RUNS}회, 중앙값)"
echo
echo "== 목록 =="
bench "limit=20"              "/posts?limit=20"
bench "limit=50"              "/posts?limit=50"
bench "제목 검색 q=인덱스"    "/posts?limit=20&q=%EC%9D%B8%EB%8D%B1%EC%8A%A4"
bench "오래된 순"             "/posts?limit=20&sort=createdAt:asc"

echo
echo "== 글 한 건 =="
FIRST=$(curl -s "$API/posts?limit=1" | pick '.items[0].id')
if [ -n "$FIRST" ]; then
  bench "상세"     "/posts/$FIRST"
  bench "댓글 20건" "/posts/$FIRST/comments?limit=20"
else
  echo "  글이 없다. 시드를 넣고 다시 돌린다 — cd server && pnpm exec tsx prisma/7.1-seed.ts"
fi
