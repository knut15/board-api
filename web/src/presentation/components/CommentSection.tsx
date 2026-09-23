// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import Link from "next/link";
import { useState } from "react";
import { useAddComment } from "../hooks/usePosts";
import { useMe } from "../hooks/useAuth";
import { formatDay } from "../format";
import { Button, Note, TextField } from "./ui";
import type { Comment } from "@/domain/comment/entity";
import type { Page } from "@/domain/post/entity";
import { useAuthGuard, messageOf } from "../hooks/useAuthGuard";
import { useLoginHref } from "../hooks/useLoginHref";

export function CommentSection({
  postId,
  comments,
  count,
}: {
  postId: string;
  comments: Page<Comment>;
  count: number;
}) {
  return (
    <section className="pt-16">
      <h2 className="border-b border-[var(--rule)] pb-3 text-ui text-[var(--muted)]">
        댓글 {count}
      </h2>

      {comments.items.length === 0 ? (
        <p className="py-8 text-ui text-[var(--muted)]">첫 댓글을 달아 보세요.</p>
      ) : (
        <ul className="list-none p-0">
          {comments.items.map((c) => (
            <li key={c.id} className="border-b border-[var(--rule)] py-5">
              <p className="flex items-baseline gap-4 text-meta text-[var(--muted)]">
                <span className="text-[var(--ink)]">{c.author.nickname}</span>
                <span>{formatDay(c.createdAt)}</span>
              </p>
              <p className="whitespace-pre-wrap pt-2 font-serif text-base leading-[1.8] text-[var(--body)]">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {comments.pageInfo.hasNext ? (
        <p className="pt-5 text-meta text-[var(--muted)]">
          댓글이 더 있습니다. 다음 페이지 불러오기는 아직 붙이지 않았습니다.
        </p>
      ) : null}

      <CommentForm postId={postId} />
    </section>
  );
}

function CommentForm({ postId }: { postId: string }) {
  const [body, setBody] = useState("");
  const { data: me } = useMe();
  const loginHref = useLoginHref();
  const add = useAddComment(postId);
  const guard = useAuthGuard();

  if (!me) {
    return (
      <p className="pt-8 text-ui text-[var(--muted)]">
        <Link href={loginHref} className="text-[var(--seal)]">
          로그인
        </Link>
        하면 댓글을 쓸 수 있습니다.
      </p>
    );
  }

  return (
    <form
      className="pt-8"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate(body, { onSuccess: () => setBody(""), onError: (e) => guard(e) });
      }}
    >
      <TextField
        label="댓글"
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="생각을 남겨 주세요."
      />
      <div className="flex items-center gap-4 pt-4">
        <Button type="submit" disabled={add.isPending || body.trim().length === 0}>
          {add.isPending ? "다는 중" : "댓글 달기"}
        </Button>
        {add.error ? <Note>{messageOf(add.error, "댓글을 달지 못했습니다.")}</Note> : null}
      </div>
    </form>
  );
}
