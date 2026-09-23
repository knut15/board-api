// 문서: docs/code/auth-password.md · 커리큘럼 6.1
//
// 비밀번호를 저장 가능한 형태로 바꾼다. 원문으로 되돌릴 수 없어야 한다.

import argon2 from "argon2";

// 왜 SHA-256 한 번으로는 안 되는가
//
// SHA-256 은 **빠르라고** 만든 함수다. 요즘 GPU 한 장이 초당 수십억 번을 돌린다.
// 비밀번호처럼 사람이 고르는 짧은 문자열은 흔한 후보 목록을 전부 돌려 보면 금방 맞는다.
// 게다가 같은 입력은 언제나 같은 해시라서, 미리 계산해 둔 표(레인보우 테이블)를
// 그대로 조회하면 된다. 유출된 해시 목록에서 같은 값이 겹치면 같은 비밀번호라는 것도 드러난다.
//
// argon2 는 반대로 **느리고 메모리를 많이 쓰라고** 만들었다.
// 이 라이브러리의 기본값은 argon2id, 메모리 64MiB(m=65536), 병렬 4(p=4), 반복 3(t=3) 이다.
// 한 번 계산에 64MiB 가 필요하니 GPU 로 수천 개를 동시에 돌리기 어렵다.
// salt 도 라이브러리가 넣어 준다 — 그래서 같은 비밀번호라도 해시가 매번 다르고,
// 미리 만든 표가 쓸모없어진다.
//
// 저장되는 문자열에 파라미터가 함께 들어 있다:
//   $argon2id$v=19$m=65536,p=4,t=3$<salt>$<hash>
// 나중에 비용을 올려도 옛 해시를 그대로 검증할 수 있는 이유다.
// (파싱할 때 m·p·t 의 순서는 가리지 않는다. 위는 이 라이브러리가 실제로 찍어 내는 순서다.)

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // 해시 형식이 아니면 argon2 가 던진다(예: 6단계 전에 만들어진 평문 행).
    // 그것을 통과시키지 않는다.
    return false;
  }
}
