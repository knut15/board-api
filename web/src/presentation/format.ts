// 문서: docs/code/web-presentation.md · 레이어: presentation

const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();

// 올해 글이면 연도를 빼고 "9월 22일" 로 쓴다. 목록에서 대부분이 올해 글이라
// 연도를 다 적으면 같은 숫자가 반복되며 제목을 가린다.
export function formatDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ko-KR", {
    ...(sameYear(d) ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
  });
}

export function formatMoment(iso: string): string {
  const d = new Date(iso);
  return `${formatDay(iso)} ${d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}
