// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePost, useDeletePost } from "../hooks/usePosts";
import { useMe } from "../hooks/useAuth";
import { canEdit } from "@/domain/post/policy";
import { useAuthGuard, messageOf } from "../hooks/useAuthGuard";
import { formatMoment } from "../format";
import { Button, Note } from "./ui";
import { CommentSection } from "./CommentSection";

export function PostDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: post, error, isPending } = usePost(id);
  const { data: me } = useMe();
  const remove = useDeletePost();
  const guard = useAuthGuard();

  if (isPending) return <p className="py-20 text-[var(--muted)]">불러오는 중</p>;
  if (error) {
    return (
      <div className="py-16">
        <Note>{error.message}</Note>
        <p className="pt-6">
          <Link href="/" className="text-ui text-[var(--muted)]">
            목록으로
          </Link>
        </p>
      </div>
    );
  }

  // 버튼을 보여 줄지 말지만 정한다. 진짜 판정은 서버의 403 이다.
  const editable = canEdit(post, me?.id ?? null);

  return (
    <article className="py-10">
      <Link
        href="/"
        className="text-meta text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        목록으로
      </Link>

      <h1
        className="pt-6 font-serif text-display font-semibold leading-[1.25]
                   tracking-[-0.01em] text-[var(--ink)]"
      >
        {post.title}
      </h1>

      <p className="flex items-baseline gap-4 pt-4 text-meta text-[var(--muted)]">
        <span className="text-[var(--ink)]">{post.author.nickname}</span>
        <span>{formatMoment(post.createdAt)}</span>
        {post.updatedAt !== post.createdAt ? <span>고침</span> : null}
      </p>

      <div
        className="max-w-[var(--measure)] whitespace-pre-wrap pt-10 font-serif
                   text-read leading-[1.9] text-[var(--body)]"
      >
        {post.body}
      </div>

      {editable ? (
        <div className="flex gap-3 pt-12">
          <Button
            variant="quiet"
            onClick={() =>
              remove.mutate(post.id, {
                // 목록에서는 이미 사라진 것처럼 보인다(낙관적 업데이트, 8.5).
                // 서버가 거부하면 훅이 되돌리고, 여기서는 안내만 띄운다.
                onSuccess: () => router.push("/"),
                onError: (e) => guard(e),
              })
            }
            disabled={remove.isPending}
          >
            {remove.isPending ? "지우는 중" : "글 지우기"}
          </Button>
        </div>
      ) : null}

      {remove.error ? (
        <div className="pt-6">
          <Note>{messageOf(remove.error, "글을 지우지 못했습니다.")}</Note>
        </div>
      ) : null}

      <CommentSection postId={post.id} comments={post.comments} count={post.commentCount} />
    </article>
  );
}
