// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import Link from "next/link";
import { useViewer, useLogout } from "../hooks/useAuth";
import { useLoginHref } from "../hooks/useLoginHref";

export function SiteHeader() {
  // useMe 가 아니라 useViewer 다. useMe 는 쿼리 캐시만 보는데, 로그아웃은 토큰을 지우는
  // 일이라 캐시에는 아무 신호도 가지 않는다. useViewer 는 토큰 자체를 구독한다.
  const { me } = useViewer();
  const logout = useLogout();
  const loginHref = useLoginHref();

  return (
    <header className="border-b border-[var(--rule)]">
      <div className="mx-auto flex w-full max-w-[var(--page)] items-baseline justify-between px-6 py-5">
        <Link
          href="/"
          className="font-serif text-[1.0625rem] font-semibold text-[var(--ink)] no-underline"
        >
          게시판
        </Link>

        <nav className="flex items-baseline gap-5 text-meta">
          {me ? (
            <>
              <span className="text-[var(--muted)]">{me.nickname}</span>
              <button
                onClick={logout}
                className="text-[var(--muted)] hover:text-[var(--ink)]"
                type="button"
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link href={loginHref} className="text-[var(--muted)] no-underline hover:text-[var(--ink)]">
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
