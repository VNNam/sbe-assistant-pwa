import { onRequestPost as handleChat } from "./functions/api/chat";
import { onRequestPost as handleAnalyze } from "./functions/api/analyze";

export interface Env {
  DB: any;
  GEMINI_API_KEY: string;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // API Routing
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChat({ request, env });
    }

    if (url.pathname === "/api/analyze" && request.method === "POST") {
      return handleAnalyze({ request, env });
    }

    // Nếu gọi vào route /api/* không hợp lệ
    if (url.pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "API route not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Chuyển tiếp tất cả request còn lại cho Cloudflare Static Assets (public/*)
    return env.ASSETS.fetch(request);
  },
};
