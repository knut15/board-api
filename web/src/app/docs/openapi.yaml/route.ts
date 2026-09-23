// 문서: docs/code/web-docs-proxy.md
//
// 디렉터리 이름에 점이 들어 있다. Express 가 보낸 HTML 이 "/docs/openapi.yaml" 을
// 절대 경로로 가리키므로, 이 주소가 그대로 있어야 화면이 명세를 찾는다.
import { proxyDocs } from "../proxy";

export const dynamic = "force-dynamic";

export const GET = () => proxyDocs("/docs/openapi.yaml");
