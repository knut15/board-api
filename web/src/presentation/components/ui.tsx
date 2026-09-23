// 문서: docs/code/web-presentation.md · 레이어: presentation
//
// 화면 여러 곳에서 쓰는 작은 조각들. 여기 없는 색·간격을 컴포넌트가 직접 쓰지 않는다.
"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Button({
  variant = "seal",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "seal" | "quiet" }) {
  const base =
    "inline-flex items-center justify-center px-4 py-2 text-ui font-medium " +
    "transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const look =
    variant === "seal"
      ? "bg-[var(--seal)] text-white hover:bg-[var(--ink)]"
      : "text-[var(--muted)] hover:text-[var(--ink)]";
  return <button className={`${base} ${look} ${className}`} {...props} />;
}

export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="block pb-1.5 text-meta text-[var(--muted)]">{label}</span>
      <input
        className="w-full border-b border-[var(--rule)] bg-transparent py-2 text-base
                   text-[var(--ink)] outline-none focus:border-[var(--seal)]"
        {...props}
      />
    </label>
  );
}

export function TextField({
  label,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="block pb-1.5 text-meta text-[var(--muted)]">{label}</span>
      <textarea
        className="w-full resize-y border-b border-[var(--rule)] bg-transparent py-2
                   font-serif text-read leading-[1.8] text-[var(--ink)]
                   outline-none focus:border-[var(--seal)]"
        {...props}
      />
    </label>
  );
}

// 에러는 사과하지 않고, 무엇이 잘못됐고 어떻게 하면 되는지만 말한다.
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="bg-[var(--seal-soft)] px-3 py-2 text-ui text-[var(--seal)]">
      {children}
    </p>
  );
}

export function Empty({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="py-24 text-center">
      <p className="font-serif text-title text-[var(--ink)]">{title}</p>
      {action ? <div className="pt-5">{action}</div> : null}
    </div>
  );
}
