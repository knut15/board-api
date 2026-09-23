// 문서: docs/code/web-docs-proxy.md · 커리큘럼 2.6 · 9.3
//
// 명세 화면을 공개 주소에 얹는다.
//
// Express 는 Railway 안에서 공개 도메인 없이 돈다(9.3 — 밖에 나가는 것은 web 하나다).
// 그래서 /docs 도 밖에서는 안 보였다. 여기서 Next 가 대신 받아 내부 주소로 넘긴다.
//
// **화면을 여기서 새로 만들지 않는다.** HTML 도 명세도 Express 가 들고 있고 이 파일은
// 통로다. 두 곳에서 각자 그리면 배포 시점이 어긋날 때 서로 다른 계약을 보여 준다.

const BASE = process.env.BOARD_API_URL ?? "http://localhost:4000";

export async function proxyDocs(path: string): Promise<Response> {
  const upstream = await fetch(`${BASE}${path}`, { cache: "no-store" });

  return new Response(await upstream.text(), {
    status: upstream.status,
    // Content-Type 을 그대로 옮긴다. 이 경로 하나가 HTML 과 YAML 을 둘 다 나르므로
    // 여기서 고정하면 한쪽이 틀린 타입으로 나간다.
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
    },
  });
}
