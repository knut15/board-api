// 문서: docs/code/web-auth-proxy.md
import { proxyAuth } from "../proxy";

export const POST = (request: Request) => proxyAuth(request, "/auth/logout");
