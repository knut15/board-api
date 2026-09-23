// 문서: docs/code/web-docs-proxy.md
import { proxyDocs } from "./proxy";

// 빌드 시점에 미리 그리지 않는다. 그러면 빌드 중에 Express 를 부르게 되고,
// 이미지 빌드에는 그런 서버가 없다.
export const dynamic = "force-dynamic";

export const GET = () => proxyDocs("/docs");
