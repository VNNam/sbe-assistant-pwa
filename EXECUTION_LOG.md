# NHẬT KÝ THỰC HIỆN DỰ ÁN (EXECUTION & MAINTENANCE LOG)

> **Dự án:** Personal SBE Assistant PWA  
> **Người thực hiện:** Software Architect / AI Engineering Agent  
> **Thời điểm cập nhật:** 2026-09-20  
> **Phiên bản:** 1.1.0  
> **Mục đích tài liệu:** Lưu trữ chi tiết lịch sử thực thi, các vấn đề phát sinh, giải pháp kỹ thuật và hướng dẫn bàn giao để phục vụ bảo trì (maintenance), phát triển tính năng (development) và mở rộng (scaling) trong các phiên làm việc tiếp theo.

---

## 1. Bối cảnh & Hiện trạng Ban đầu

Tại thời điểm bắt đầu phiên làm việc:

- Dự án đã hoàn thiện khung giao diện Split-screen (Chatbox + Gherkin Editor), file cấu hình Cloudflare Pages và Service Worker sơ khởi.
- Đã có backend cơ bản `functions/api/chat.ts` để phân tích kịch bản Gherkin qua Gemini REST API và lưu dữ liệu vào Cloudflare D1.
- **Tồn tại kỹ thuật phát hiện được:**
  1. Script build trong `package.json` dùng lệnh `mv public/js/sw.js public/sw.js`, phụ thuộc shell Unix/Linux, gây lỗi khi chạy trên Windows.
  2. File Service Worker bị đặt trong `public/js/sw.js` thay vì Web Root `public/sw.js`, dẫn đến rủi ro lệch scope hoặc lỗi 404 khi deploy.
  3. Nút "Tổng kết (Recall)" trên giao diện (`#btnRecall`) chỉ là thông báo tĩnh (mockup), chưa có backend endpoint để đọc `Memory_Blocks` từ D1 phục vụ RAG.
  4. Chưa có tài liệu kiến trúc chính thức (`ARCHITECTURE.md`) hệ thống hóa toàn bộ luồng dữ liệu, cấu trúc thư mục và sơ đồ tương tác.

---

## 2. Chi tiết Tiến trình Thực hiện (Changelog Chi tiết)

### Giai đoạn 1: Kiến trúc & Hệ thống hóa Tài liệu

- **Khảo sát toàn bộ mã nguồn:** Phân tích `package.json`, `tsconfig.json`, `wrangler.toml`, `schema.sql`, `src/index.ts`, `functions/api/chat.ts` và `public/index.html`.
- **Thiết lập tài liệu kiến trúc:** Tạo file [`ARCHITECTURE.md`](./ARCHITECTURE.md) với:
  - Tổng quan mục đích và công nghệ.
  - Phân tích vai trò từng file.
  - 02 sơ đồ Mermaid.js: Sơ đồ kiến trúc 3 tầng (Client Tier, Edge Serverless Tier, Data & AI Tier) và Sơ đồ luồng hoạt động tuần tự (Sequence Diagram).
  - Đánh giá điểm mạnh, nợ kỹ thuật và lộ trình mở rộng 4 giai đoạn.

---

### Giai đoạn 2: Chuẩn hóa Build Pipeline & Định vị Service Worker

- **Vấn đề kỹ thuật:** Lệnh `mv` trong `package.json` không chạy được trên Windows và phụ thuộc vào hệ điều hành. File `sw.js` là tài nguyên tĩnh của trình duyệt, không cần qua trình biên dịch TypeScript `tsc`.
- **Các bước xử lý:**
  1. Tạo mới file [`public/sw.js`](./public/sw.js) trực tiếp tại thư mục Web Root (`public/`) với đầy đủ chiến lược `Cache-First` cho static assets và `Network-First` với HTTP 503 fallback cho `/api/*`.
  2. Xóa bỏ file thừa [`public/js/sw.js`](./public/js/sw.js).
  3. Cập nhật [`package.json`](./package.json):
     ```json
     "scripts": {
       "build": "tsc",
       "watch": "tsc -w",
       "dev": "wrangler pages dev public"
     }
     ```
- **Kết quả đạt được:** Lệnh `npm run build` hoàn toàn cross-platform, chạy đồng nhất trên Windows, macOS và Cloudflare Native CI (Linux).

---

### Giai đoạn 3: Xây dựng Endpoint RAG Backend (`/api/analyze`)

- **Mục tiêu:** Kích hoạt trí nhớ dài hạn (RAG) để đánh giá sự tiến bộ của người học qua các tuần.
- **Các bước xử lý:**
  1. Tạo mới file [`functions/api/analyze.ts`](./functions/api/analyze.ts):
     - **Input:** Payload JSON `{ currentWeek: number }`.
     - **Database Query:** Thực thi câu lệnh SQL với binding `env.DB`:
       ```sql
       SELECT week_id, summary_json, created_at FROM Memory_Blocks WHERE week_id <= ? ORDER BY week_id ASC, id ASC
       ```
     - **Empty State Guard:** Nếu chưa có bản ghi nào trong `Memory_Blocks`, trả về `{ empty: true, message: "..." }` hướng dẫn người học nộp kịch bản trước khi tổng kết.
     - **Prompt Engineering & Gemini API:** Đóng gói toàn bộ lịch sử các khối trí nhớ, gọi mô hình `gemini-2.5-flash` với cấu hình `response_mime_type: "application/json"`, nhiệt độ `0.2` để trích xuất cấu trúc:
       ```json
       {
         "overview": "Đánh giá tổng quan súc tích...",
         "readiness_score": 85,
         "mastered_concepts": ["Khái niệm 1", "..."],
         "recurring_mistakes": ["Lỗi còn lặp lại", "..."],
         "action_plan": ["Kế hoạch hành động cụ thể", "..."]
       }
       ```
     - **Output:** Trả về HTTP 200 kèm payload kết quả đã parse sạch sẽ.

---

### Giai đoạn 4: Tích hợp Frontend Recall Dashboard

- **Mục tiêu:** Cho phép người học bấm nút `#btnRecall` và nhận Dashboard tiến trình học tập trực quan ngay trong khung chat.
- **Các bước xử lý trong [`src/index.ts`](./src/index.ts):**
  1. Thay thế handler click cũ bằng hàm `async`.
  2. Quản lý trạng thái nút bấm: vô hiệu hóa nút và đổi text thành `"Đang tổng kết..."`.
  3. Gọi POST `/api/analyze` kèm `currentWeek`.
  4. Bắt lỗi ngoại tuyến: nếu mất mạng (HTTP 503 từ Service Worker), thông báo cảnh báo nhẹ nhàng.
  5. Render giao diện **Bảng Tổng Kết Tiến Trình Học Tập**:
     - Huy hiệu điểm sẵn sàng `readiness_score/100` tự đổi màu: Xanh lá (`>= 80`), Vàng (`>= 50`), Đỏ (`< 50`).
     - Khối khái niệm đã làm chủ (icon `✔`).
     - Khối lỗi sai còn lặp lại (icon `⚠`).
     - Khối kế hoạch hành động gợi ý (icon `💡`).
     - Thông tin số lượng kịch bản đã được tổng hợp từ `Memory_Blocks`.

---

### Giai đoạn 5: Biên dịch & Kiểm thử Hệ thống

- **Cài đặt môi trường:** Chạy `npm install` bổ sung đầy đủ 534 packages theo `package-lock.json`.
- **Biên dịch mã nguồn:** Thực thi `npm run build`:
  - `tsc` biên dịch thành công từ `src/index.ts` ra [`public/js/index.js`](./public/js/index.js) (kích thước: 10,207 bytes).
  - Không có lỗi type checking hay cú pháp.
- **Đồng bộ tài liệu:** Cập nhật lại [`ARCHITECTURE.md`](./ARCHITECTURE.md) phản ánh trạng thái hoàn thành của Phase 1.

---

### Giai đoạn 6: Khắc phục lỗi Cloudflare Deploy (`Binding 'DB' requires ES module format [code: 100329]`)

- **Triệu chứng lỗi trên Cloudflare CI:**
  ```text
  ✘ [ERROR] A request to the Cloudflare API failed.
    Binding 'DB' of type 'd1' requires a Worker written in ES module format. [code: 100329]
  ```
- **Nguyên nhân gốc rễ (Root Cause):**
  - Trong `wrangler.jsonc`, thuộc tính `"main"` bị trỏ vào `"./public/sw.js"`.
  - `public/sw.js` là Browser Service Worker sử dụng cú pháp `addEventListener("fetch")` (dạng Service Worker syntax cũ). Cloudflare D1 yêu cầu bắt buộc Worker phải viết dưới định dạng **ES Module** (`export default { fetch }`).
  - Ngoài ra, `public/sw.js` chỉ chạy ở trình duyệt để lưu cache offline, không chứa router cho `/api/chat` và `/api/analyze`.
- **Giải pháp thực hiện:**
  1. Tạo mới entrypoint [`worker.ts`](./worker.ts) theo định dạng ES Module:
     - Định tuyến POST `/api/chat` vào `functions/api/chat.ts`.
     - Định tuyến POST `/api/analyze` vào `functions/api/analyze.ts`.
     - Chuyển tiếp các request tĩnh còn lại cho `env.ASSETS.fetch(request)` (phục vụ từ `public/`).
  2. Sửa `"main": "./public/sw.js"` thành `"main": "./worker.ts"` trong [`wrangler.jsonc`](./wrangler.jsonc).
  3. Kiểm tra `npx wrangler deploy --dry-run`: Đóng gói thành công bundle 9.79 KiB, binding D1 được chấp thuận hoàn toàn.

---

### Giai đoạn 7: Khắc phục lỗi `API route not found`, CORS Preflight và JSON Parsing từ LLM

- **Triệu chứng lỗi:**
  1. Client gửi kịch bản nhận phản hồi: `{"error":"API route not found"}`.
  2. Trực tiếp gọi API trả về: `{"error":"Lỗi máy chủ: Expected property name or '}' in JSON at position 1 (line 1 column 2)"}`.
- **Nguyên nhân cốt lõi (Root Cause):**
  1. Trong `worker.ts`, điều kiện định tuyến so khớp cứng `url.pathname === "/api/chat" && request.method === "POST"`. Khi browser gửi `OPTIONS` (CORS preflight) hoặc URL có dấu gạch chéo cuối (`/api/chat/`) hoặc phương thức khác `POST`, request bị rơi vào nhánh fallback trả về `404 API route not found`.
  2. Gemini 2.5 Flash đôi khi bọc kết quả trong markdown code fence (`json\n...\n`), khiến lệnh `JSON.parse()` nguyên bản trong `chat.ts` và `analyze.ts` bị vỡ cú pháp.
- **Giải pháp thực hiện:**
  1. Cải tiến [`worker.ts`](./worker.ts):
     - Chuẩn hóa URL, loại bỏ trailing slash (`url.pathname.replace(/\/+$/, "")`).
     - Bổ sung xử lý CORS Preflight (`OPTIONS`) trả về HTTP 204 kèm headers `Access-Control-Allow-*`.
     - Bao bọc mọi phản hồi API bằng helper `withCors()` để đảm bảo không bị chặn bởi chính sách cùng nguồn gốc.
     - Trả về mã lỗi HTTP 405 (Method Not Allowed) rõ ràng nếu truy cập sai phương thức (ví dụ dùng `GET` trên trình duyệt).
  2. Cải tiến [`functions/api/chat.ts`](./functions/api/chat.ts) và [`functions/api/analyze.ts`](./functions/api/analyze.ts):
     - Thêm cơ chế tự động bóc tách và làm sạch markdown code fence trước khi gọi `JSON.parse()`.
  3. Kiểm tra `wrangler deploy --dry-run`: Thành công, bundle đạt 12.21 KiB.

---

### Giai đoạn 8: Khắc phục lỗi `sw.js Response body is already used` và Lỗi 500 (`/favicon.ico`, `/api/chat`)

- **Triệu chứng lỗi:**
  1. Console báo lỗi: `sw.js:36 Uncaught (in promise) TypeError: Failed to execute 'clone' on 'Response': Response body is already used`.
  2. Server trả về HTTP 500 cho `/favicon.ico` và `/api/chat`.
- **Nguyên nhân cốt lõi (Root Cause):**
  1. Trong `public/sw.js`, `networkResponse.clone()` bị gọi bất đồng bộ bên trong callback `caches.open().then(...)`. Tại thời điểm callback này chạy, luồng đọc (ReadableStream) của body response đã bị trình duyệt tiêu thụ (consumed/disturbed). Ngoài ra, Service Worker cố tình cache cả những response lỗi 500 và request không phải `GET`.
  2. Cloudflare Worker Assets báo lỗi 1101 (HTTP 500) khi trình duyệt tự động hỏi `/favicon.ico` vì file này không có trong `public/`.
  3. Khi gọi Gemini thực tế, phản hồi đôi khi chứa preamble text hoặc markdown code block, dẫn đến lỗi `Expected property name or '}' in JSON at position 1 (line 1 column 2)`.
- **Giải pháp thực hiện:**
  1. Nâng cấp [`public/sw.js`](./public/sw.js):
     - Chỉ cache các request phương thức `GET`.
     - Chỉ cache các phản hồi thành công `HTTP 200`.
     - Thực hiện `networkResponse.clone()` **đồng bộ ngay lập tức** trước khi stream bị consume.
     - Tăng version cache lên `sbe-assistant-v2` và kích hoạt `self.skipWaiting()` + `self.clients.claim()` để dọn dẹp cache cũ.
  2. Nâng cấp [`worker.ts`](./worker.ts):
     - Bổ sung handler trả về `204 No Content` cho `/favicon.ico`, ngăn chặn triệt để lỗi 500 từ asset fetch.
     - Bọc `env.ASSETS.fetch` trong try/catch để tránh unhandled exceptions.
  3. Nâng cấp [`functions/api/chat.ts`](./functions/api/chat.ts) và [`functions/api/analyze.ts`](./functions/api/analyze.ts):
     - Bổ sung parser đa tầng: thử parse trực tiếp $\rightarrow$ thử bóc tách block markdown $\rightarrow$ thử tìm cặp ngoặc nhọn `{ ... }` đầu tiên và cuối cùng.

---

### Giai đoạn 9: Khắc phục triệt để lỗi `Method GET not allowed, please use POST` & Cấu hình API Key

- **Triệu chứng lỗi:**
  1. Khi bấm "Gửi Kịch bản", màn hình hiện lỗi: `{"error":"Method GET not allowed, please use POST."}`.
  2. Khi gọi API trực tiếp thành công, server trả về: `{"error":"Chưa cấu hình API Key"}`.
- **Nguyên nhân cốt lõi (Root Cause):**
  1. Trình duyệt tự động chuyển đổi phương thức từ `POST` sang `GET` do:
     - Truy cập qua giao thức `http://`: Cloudflare tự động chuyển hướng sang `https://` bằng mã HTTP 301/302. Theo chuẩn HTTP, các trình duyệt sẽ tự động drop body và đổi method thành `GET`.
     - Service Worker cũ can thiệp vào `/api/*` bằng `fetch(event.request)`.
  2. Biến môi trường bí mật `GEMINI_API_KEY` chưa được thêm vào phần **Variables and Secrets** của Cloudflare Worker trên Dashboard sau khi chuyển đổi dự án sang Worker.
- **Giải pháp thực hiện:**
  1. Cập nhật [`public/sw.js`](./public/sw.js) lên version `sbe-assistant-v3`: Bỏ qua hoàn toàn (bypass) các route `/api/*`, để trình duyệt trực tiếp gửi request POST tới Edge Server.
  2. Cập nhật [`public/index.html`](./public/index.html): Bổ sung script tự động reload sang `https://` ở `<head>` nếu người dùng vô tình truy cập qua `http://`.
  3. Cập nhật [`worker.ts`](./worker.ts): Nếu nhận request qua `http://`, chuyển hướng sang `https://` bằng mã **HTTP 308** (chuẩn HTTP bảo lưu phương thức POST và request body).
  4. Cập nhật [`src/index.ts`](./src/index.ts): Đọc thông điệp lỗi chi tiết `errJson.error` từ server để hiển thị rõ ràng trên khung chat thay vì chỉ in mã HTTP status.
  5. Hướng dẫn người dùng cấu hình `GEMINI_API_KEY` vào phần Variables and Secrets của Cloudflare Worker.

---

### Giai đoạn 10: Nâng cấp Mô hình Gemini sang `gemini-3.6-flash`

- **Triệu chứng lỗi từ Google API:**
  ```json
  {
    "error": {
      "code": 404,
      "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements.",
      "status": "NOT_FOUND"
    }
  }
  ```
- **Nguyên nhân gốc rễ:**
  - Google Gemini API đã ngừng cung cấp mô hình `gemini-2.5-flash` cho người dùng mới và yêu cầu nâng cấp lên phiên bản mới nhất `gemini-3.6-flash`.
- **Giải pháp thực hiện:**
  1. Cập nhật endpoint gọi API trong [`functions/api/chat.ts`](./functions/api/chat.ts):
     - `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`
  2. Cập nhật endpoint gọi API trong [`functions/api/analyze.ts`](./functions/api/analyze.ts):
     - `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`
  3. Đồng bộ hóa toàn bộ tài liệu dự án:
     - [`ARCHITECTURE.md`](./ARCHITECTURE.md): Bảng Tech Stack, phần giải thích file và 2 sơ đồ Mermaid.js.
     - [`SBE-Assistant-Master-Document.md`](./SBE-Assistant-Master-Document.md): Mục AI Integration.
  4. Biên dịch và kiểm thử: `npm run build` thành công, `npx wrangler deploy --dry-run` hoàn tất không lỗi.

---

## 3. Tổng hợp Thay đổi File (Matrix File Changes)

| Tên File                                                 | Thao tác               | Mô tả thay đổi                                                                  |
| :------------------------------------------------------- | :--------------------- | :------------------------------------------------------------------------------ |
| [`worker.ts`](./worker.ts)                               | **Tạo mới**            | Cloudflare Worker ES Module entrypoint định tuyến API và phục vụ static assets. |
| [`wrangler.jsonc`](./wrangler.jsonc)                     | **Chỉnh sửa**          | Trỏ `"main": "./worker.ts"` thay vì file browser sw.js.                         |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)                   | **Tạo mới & Cập nhật** | Tài liệu kiến trúc toàn diện kèm 2 sơ đồ Mermaid.js và lộ trình phát triển.     |
| [`EXECUTION_LOG.md`](./EXECUTION_LOG.md)                 | **Tạo mới & Cập nhật** | Nhật ký thực hiện toàn bộ tiến trình để phục vụ tra cứu sau này.                |
| [`package.json`](./package.json)                         | **Chỉnh sửa**          | Sửa script `"build": "tsc"` loại bỏ lệnh `mv` phụ thuộc nền tảng.               |
| [`public/sw.js`](./public/sw.js)                         | **Tạo mới**            | Đặt Service Worker đúng thư mục gốc Web Root của Cloudflare Pages.              |
| [`public/js/sw.js`](./public/js/sw.js)                   | **Xóa bỏ**             | Loại bỏ file thừa để tránh nhầm lẫn cấu trúc.                                   |
| [`functions/api/analyze.ts`](./functions/api/analyze.ts) | **Tạo mới**            | Edge Function xử lý RAG: đọc D1 `Memory_Blocks` và gọi Gemini 2.5 Flash.        |
| [`src/index.ts`](./src/index.ts)                         | **Chỉnh sửa**          | Tích hợp sự kiện gọi `/api/analyze` và render Dashboard Recall vào khung chat.  |
| [`public/js/index.js`](./public/js/index.js)             | **Biên dịch tự động**  | File JavaScript chạy ở trình duyệt được sinh từ `src/index.ts`.                 |

---

## 4. Hướng dẫn Dành cho Agent / Developer Phiên Tiếp Theo

Khi tiếp nhận dự án để phát triển hoặc bảo trì các bước tiếp theo, vui lòng lưu ý:

### 4.1. Lệnh thường dùng

```powershell
# Cài đặt dependencies (nếu clone máy mới)
npm install

# Biên dịch TypeScript sang public/js/index.js
npm run build

# Chế độ theo dõi biên dịch liên tục khi code frontend
npm run watch

# Chạy serverless local với Wrangler (mô phỏng Pages + D1)
npm run dev
```

### 4.2. Quản lý Cơ sở dữ liệu Cloudflare D1

- Schema hiện tại nằm tại [`schema.sql`](./schema.sql).
- Tên database: `sbe-memory-db`.
- Để áp dụng schema lên local:
  ```powershell
  npx wrangler d1 execute sbe-memory-db --local --file=./schema.sql
  ```
- Để áp dụng schema lên production:
  ```powershell
  npx wrangler d1 execute sbe-memory-db --remote --file=./schema.sql
  ```

### 4.3. Các Hạng mục Khuyến nghị Tiếp theo (Next Roadmap Tasks)

1. **Multi-tenancy (Đa người dùng):**
   - Bổ sung trường `user_id` vào 2 bảng `Chat_History` và `Memory_Blocks` trong `schema.sql`.
   - Cập nhật `functions/api/chat.ts` và `functions/api/analyze.ts` nhận và lọc theo `user_id`.
   - Thêm xác thực người dùng (Cloudflare Access / Clerk / Supabase Auth).
2. **Streaming Response cho Chat:**
   - Cải tiến `/api/chat` trả về Server-Sent Events (SSE) để nội dung phân tích hiển thị dạng gõ chữ mượt mà.
3. **Nâng cấp Gherkin Editor:**
   - Tích hợp thư viện Monaco Editor hoặc CodeMirror hỗ trợ syntax highlighting cho từ khóa Gherkin (`Feature`, `Scenario`, `Given`, `When`, `Then`).
