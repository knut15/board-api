#!/usr/bin/env bash
# 문서: docs/14-verification.md
#
# 로컬 회귀 전체. verify-validation.sh 와 verify-auth.sh 를 잇달아 돌린다.
#
#   ./scripts/verify.sh
#
# ⚠ **DB 를 비운다**(verify-auth.sh 가 비운다). 7단계 시드가 들어 있으면 사라진다.
#    끝나면 다시 넣는다 — cd server && pnpm exec tsx prisma/7.1-seed.ts

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
worst=0

for name in verify-validation verify-auth; do
  echo "───────── $name ─────────"
  "$HERE/$name.sh" || worst=1
  echo
done

if [ "$worst" -eq 0 ]; then
  echo "전부 통과."
else
  echo "실패한 검사가 있다. 위를 본다." >&2
fi
exit "$worst"
