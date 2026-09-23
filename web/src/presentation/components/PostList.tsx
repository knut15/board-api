// 문서: docs/code/web-presentation.md · 레이어: presentation · 커리큘럼 8.3 · 8.6
//
// 목록은 카드가 아니라 행이다. 게시판에서 눈이 하는 일은 제목을 훑는 것 하나뿐이고,
// 테두리와 그림자는 그 일을 돕지 않는다.
"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePostList } from "../hooks/usePosts";
import { useMe } from "../hooks/useAuth";
import { formatDay } from "../format";
import { Button, Empty, Note } from "./ui";
import type { PostSummary } from "@/domain/post/entity";
import type { PostFilter } from "@/application/ports/repositories";

export function PostList() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<PostFilter["sort"]>("createdAt:desc");

  // 한 글자마다 요청을 보내면 "인덱스" 를 치는 동안 세 번 나간다. 손이 멈춘 뒤에 보낸다.
  const debouncedQ = useDebounced(q.trim(), 300);

  const filter: PostFilter = { sort, ...(debouncedQ ? { q: debouncedQ } : {}) };
  const { data, error, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePostList(filter);
  const { data: me } = useMe();

  const sentinel = useInfiniteScroll(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  });

  const posts = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="flex items-baseline justify-between py-8">
        <h1 className="font-serif text-title font-semibold text-[var(--ink)]">글</h1>
        <Link href="/posts/new" className="no-underline">
          <Button>글 쓰기</Button>
        </Link>
      </div>

      <div className="flex items-baseline gap-6 pb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제목 검색"
          aria-label="제목 검색"
          className="min-w-0 flex-1 border-b border-[var(--rule)] bg-transparent pb-2
                     text-base text-[var(--ink)] outline-none
                     placeholder:text-[var(--muted)] focus:border-[var(--seal)]"
        />
        <button
          type="button"
          onClick={() => setSort(sort === "createdAt:desc" ? "createdAt:asc" : "createdAt:desc")}
          className="shrink-0 text-meta text-[var(--muted)] hover:text-[var(--ink)]"
        >
          {sort === "createdAt:desc" ? "최신순" : "오래된 순"}
        </button>
      </div>

      {error ? (
        <div className="py-10">
          <Note>{error.message}</Note>
        </div>
      ) : isPending ? (
        <p className="py-20 text-[var(--muted)]">불러오는 중</p>
      ) : posts.length === 0 ? (
        <Empty
          title={debouncedQ ? `"${debouncedQ}" 와 맞는 글이 없습니다.` : "아직 글이 없습니다."}
          action={
            debouncedQ ? (
              <Button variant="quiet" onClick={() => setQ("")}>
                검색어 지우기
              </Button>
            ) : (
              <Link href="/posts/new" className="no-underline">
                <Button>첫 글 쓰기</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <ul className="list-none p-0">
            {posts.map((post) => (
              <PostRow key={post.id} post={post} mine={post.author.id === me?.id} />
            ))}
          </ul>

          {/* 8.6 — 이 줄이 화면에 들어오면 다음 장을 부른다. 버튼을 누르지 않아도 된다. */}
          <div ref={sentinel} aria-hidden className="h-px" />

          <p className="pt-10 text-center text-meta text-[var(--muted)]">
            {isFetchingNextPage ? "불러오는 중" : hasNextPage ? " " : "마지막 글입니다."}
          </p>
        </>
      )}
    </>
  );
}

function PostRow({ post, mine }: { post: PostSummary; mine: boolean }) {
  return (
    <li className="border-t border-[var(--rule)]">
      <Link href={`/posts/${post.id}`} className="group block py-6 no-underline">
        <div className="flex items-baseline justify-between gap-6">
          <h2
            className="font-serif text-title leading-snug text-[var(--ink)]
                       decoration-[var(--seal)] decoration-1 underline-offset-[6px]
                       group-hover:underline"
          >
            {post.title}
          </h2>
          {post.commentCount > 0 ? (
            <span className="shrink-0 text-meta text-[var(--muted)] tabular-nums">
              댓글 {post.commentCount}
            </span>
          ) : null}
        </div>

        <p className="flex items-baseline gap-4 pt-2 text-meta text-[var(--muted)]">
          <span className={mine ? "text-[var(--seal)]" : undefined}>{post.author.nickname}</span>
          <span>{formatDay(post.createdAt)}</span>
        </p>
      </Link>
    </li>
  );
}

// 입력이 멈춘 뒤에 값을 내보낸다.
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

// 감시하는 요소가 화면에 들어오면 콜백을 부른다.
// 스크롤 이벤트를 듣고 위치를 계산하는 방식보다 싸다 — 브라우저가 알아서 알려 준다.
//
// **ref 객체가 아니라 콜백 ref 를 돌려준다.** useEffect 로 한 번만 옵저버를 만들면,
// 그 시점에는 목록이 아직 로딩 중이라 감시할 요소가 없다. 나중에 요소가 붙어도
// effect 는 다시 돌지 않아서 옵저버가 영영 만들어지지 않는다.
// 콜백 ref 는 요소가 붙고 떨어질 때마다 불리므로 그 문제가 없다.
function useInfiniteScroll(onReach: () => void) {
  const handler = useRef(onReach);
  useEffect(() => {
    handler.current = onReach;
  });

  const observer = useRef<IntersectionObserver | null>(null);

  return useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) return;

    // rootMargin 으로 화면에 닿기 전에 미리 부른다. 바닥에 도착한 뒤에 부르면
    // 기다리는 시간이 그대로 보인다.
    observer.current = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handler.current();
      },
      { rootMargin: "400px" },
    );
    observer.current.observe(node);
  }, []);
}
