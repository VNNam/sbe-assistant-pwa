import { onRequestPost as handleChat } from "./functions/api/chat";
import { onRequestPost as handleAnalyze } from "./functions/api/analyze";

export interface Env {
  DB: any;
  GEMINI_API_KEY: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function withCors(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    // Chuẩn hóa pathname: loại bỏ trailing slash (ví dụ: /api/chat/ -> /api/chat)
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    // 1. Xử lý CORS Preflight (OPTIONS) cho mọi route
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    // 2. Định tuyến API /api/chat
    if (pathname === "/api/chat") {
      if (method !== "POST") {
        return withCors(
          new Response(
            JSON.stringify({
              error: `Method ${method} not allowed, please use POST.`,
            }),
            { status: 405, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      try {
        const res = await handleChat({ request, env });
        return withCors(res);
      } catch (err: any) {
        return withCors(
          new Response(
            JSON.stringify({ error: "Lỗi xử lý chat: " + err.message }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
    }

    // 3. Định tuyến API /api/analyze
    if (pathname === "/api/analyze") {
      if (method !== "POST") {
        return withCors(
          new Response(
            JSON.stringify({
              error: `Method ${method} not allowed, please use POST.`,
            }),
            { status: 405, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      try {
        const res = await handleAnalyze({ request, env });
        return withCors(res);
      } catch (err: any) {
        return withCors(
          new Response(
            JSON.stringify({ error: "Lỗi xử lý analyze: " + err.message }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          ),
        );
      }
    }

    // 4. Bắt tất cả các route /api/* không hợp lệ khác
    if (pathname.startsWith("/api/")) {
      return withCors(
        new Response(
          JSON.stringify({ error: `API route '${pathname}' not found` }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    // 5. Chuyển tiếp tất cả request còn lại cho Cloudflare Static Assets (public/*)
    return env.ASSETS.fetch(request);
  },
};
