// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCreatePost } from "../hooks/usePosts";
import { useViewer } from "../hooks/useAuth";
import { TITLE_MAX } from "@/domain/post/policy";
import { Button, Note, TextField } from "./ui";
import { useAuthGuard, messageOf } from "../hooks/useAuthGuard";
import { useLoginHref } from "../hooks/useLoginHref";
import Link from "next/link";

export function NewPostForm() {
  const router = useRouter();
  const { me, resolved } = useViewer();
  const create = useCreatePost();
  const guard = useAuthGuard();
  const loginHref = useLoginHref();
  const [form, setForm] = useState({ title: "", body: "" });

  if (resolved && !me) {
    return (
      <div className="py-24">
        <p className="font-serif text-title text-[var(--ink)]">
          글을 쓰려면 로그인해야 합니다.
        </p>
        <p className="pt-5">
          <Link href={loginHref} className="no-underline">
            <Button>로그인하러 가기</Button>
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form
      className="py-12"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(form, {
          onSuccess: (post) => router.push(`/posts/${post.id}`),
          onError: (e) => guard(e),
        });
      }}
    >
      <label className="block">
        <span className="sr-only">제목</span>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          maxLength={TITLE_MAX}
          placeholder="제목"
          autoFocus
          className="w-full border-none bg-transparent font-serif text-display
                     font-semibold leading-tight text-[var(--ink)] outline-none
                     placeholder:text-[var(--rule)]"
        />
      </label>

      <div className="pt-8">
        <TextField
          label="본문"
          rows={14}
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
        />
      </div>

      {create.error ? (
        <div className="pt-6">
          <Note>{messageOf(create.error, "글을 올리지 못했습니다.")}</Note>
        </div>
      ) : null}

      <div className="flex items-center gap-5 pt-8">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "올리는 중" : "글 올리기"}
        </Button>
        <span className="text-meta text-[var(--muted)] tabular-nums">
          {form.title.length}/{TITLE_MAX}
        </span>
      </div>
    </form>
  );
}
