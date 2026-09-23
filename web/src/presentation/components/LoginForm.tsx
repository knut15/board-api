// 문서: docs/code/web-presentation.md · 레이어: presentation
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useLogin, useSignup } from "../hooks/useAuth";
import { Button, Field, Note } from "./ui";

export function LoginForm() {
  const router = useRouter();

  // 8.7 — 401 때문에 밀려 왔다면 돌아갈 자리가 실려 온다.
  // 열린 리다이렉트를 막으려고 "/" 로 시작하는 내부 경로만 받는다 —
  // returnTo=https://남의사이트 를 그대로 믿으면 로그인 직후 그리로 보내진다.
  const returnTo = useSearchParams().get("returnTo");
  const safeReturnTo = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ email: "", password: "", nickname: "" });

  const login = useLogin();
  const signup = useSignup();
  const busy = login.isPending || signup.isPending;
  const error = login.error ?? signup.error;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // mutateAsync 는 실패하면 거부한다. 잡지 않으면 처리되지 않은 rejection 이 되어
    // 에러가 폼이 아니라 개발 오버레이로 튀어나온다.
    // 실패 내용은 login.error·signup.error 에 이미 담기므로 여기서는 멈추기만 하면 된다.
    try {
      if (mode === "signup") {
        await signup.mutateAsync(form);
      }
      await login.mutateAsync({ email: form.email, password: form.password });
    } catch {
      return;
    }

    router.push(safeReturnTo);
  }

  return (
    <div className="mx-auto max-w-[24rem] py-20">
      <h1 className="font-serif text-display font-semibold leading-tight text-[var(--ink)]">
        {mode === "login" ? "로그인" : "가입"}
      </h1>

      <form className="flex flex-col gap-6 pt-10" onSubmit={submit}>
        <Field
          label="이메일"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={set("email")}
        />
        <Field
          label="비밀번호"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          value={form.password}
          onChange={set("password")}
        />
        {mode === "signup" ? (
          <Field label="닉네임" required value={form.nickname} onChange={set("nickname")} />
        ) : null}

        {error ? <Note>{error.message}</Note> : null}

        <div className="flex items-center justify-between pt-2">
          <Button type="submit" disabled={busy}>
            {busy ? "보내는 중" : mode === "login" ? "로그인" : "가입하고 시작하기"}
          </Button>
          <button
            type="button"
            className="text-meta text-[var(--muted)] hover:text-[var(--ink)]"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "계정이 없습니다" : "이미 계정이 있습니다"}
          </button>
        </div>
      </form>
    </div>
  );
}
