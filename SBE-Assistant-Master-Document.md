Dưới đây là tài liệu tổng hợp toàn bộ kiến trúc, thiết kế, luồng thực thi và trạng thái mã nguồn của dự án Personal SBE Assistant được đúc kết từ lịch sử trao đổi của chúng ta. Bạn có thể lưu lại nội dung này thành file SBE-Assistant-Master-Document.md để làm tài liệu tham chiếu (Source of Truth) cho tất cả các phiên làm việc tiếp theo.

# **TÀI LIỆU DỰ ÁN: PERSONAL SBE ASSISTANT PWA**

## **1\. Tổng quan Dự án**

- **Mục tiêu:** Xây dựng một ứng dụng học tập cá nhân hóa (AI Agent) đóng vai trò "SBE Mentor" hướng dẫn khóa học Specification by Example trong 4 tuần.
- **Vấn đề giải quyết:** Khắc phục giới hạn bộ nhớ (context window) của mô hình ngôn ngữ lớn (LLM) thông qua cơ chế lưu trữ dài hạn dạng JSON và truy vấn ngược (RAG). Điều này giúp AI bám sát tiến độ học tập, ghi nhớ lỗi sai và không quên ngữ cảnh.
- **Môi trường Live (Production):** Ứng dụng đã được triển khai thực tế trên Cloudflare Pages tại tên miền tùy chỉnh (ví dụ: \[https://sbe-assistant-pwa.vnnam.workers.dev/\](https://sbe-assistant-pwa.vnnam.workers.dev/)).

## **2\. Kiến trúc Công nghệ (Tech Stack)**

- **Front-end:** HTML tĩnh, CSS (Grid/Flexbox), và TypeScript biên dịch sang JavaScript thuần.
- **Back-end (Serverless):** Cloudflare Pages Functions (Node.js) xử lý API trung gian.
- **Database:** Cloudflare D1 (SQLite) lưu trữ dữ liệu hệ thống trên Edge Network.
- **AI Integration:** Tích hợp trực tiếp Gemini REST API (model gemini-2.5-flash) thông qua fetch, ép kiểu dữ liệu trả về chuẩn JSON.
- **PWA & Offline:** Service Worker viết bằng JavaScript thuần (public/sw.js) và manifest.json.
- **CI/CD:** Cloudflare Native CI kết nối trực tiếp với nhánh main của GitHub.

## **3\. Cấu trúc Thư mục Hệ thống**

Dự án được tổ chức theo cấu trúc tiêu chuẩn để Cloudflare Pages nhận diện chính xác:

&nbsp;

&nbsp;

&nbsp;

Plaintext

sbe-assistant-pwa/  
├── public/ \# Thư mục build output (trang tĩnh)  
│ ├── index.html \# Giao diện chính chia đôi màn hình  
│ ├── manifest.json \# Cấu hình PWA cài đặt ứng dụng  
│ ├── sw.js \# Service Worker xử lý Cache & Offline  
│ └── js/ \# Chứa file index.js sau khi tsc biên dịch  
├── src/ \# Thư mục chứa mã nguồn TypeScript  
│ └── index.ts \# Logic Frontend (bắt sự kiện, gọi API)  
├── functions/ \# Thư mục chứa Backend Serverless  
│ └── api/  
│ ├── chat.ts \# Endpoint gọi Gemini API xử lý kịch bản  
│ └── analyze.ts \# (Dự kiến) Endpoint truy vấn ngược RAG  
├── package.json \# Cấu hình npm scripts (build, dev)  
├── tsconfig.json \# Cấu hình TypeScript (moduleResolution: node16)  
├── .dev.vars \# Chứa GEMINI_API_KEY (chạy local, đã gitignore)  
└── .gitignore \# Loại bỏ node_modules, dist, .dev.vars

## **4\. Thiết kế Cơ sở Dữ liệu (Cloudflare D1)**

Dữ liệu được lưu trữ để phục vụ cơ chế RAG, chia làm 2 bảng chính:

> 1. **Chat_History:** Lưu trữ từng dòng tin nhắn ngắn hạn, Timestamp, và tuần học (week_id).
> 2. **Memory_Blocks:** Lưu bộ nhớ dài hạn dưới dạng JSON để AI đọc lại tiến độ. Cấu trúc JSON 5 khối bao gồm:

- **Khối Định danh (Metadata):** ID phiên học, tuần học (1-4), nhãn thời gian.
- **Khối Kiến thức (Learned Concepts):** Mảng từ khóa/nguyên tắc SBE đã nắm vững (VD: "Outside-in", "Goldilocks").
- **Khối Phân tích Lỗi (Mistakes Tracking):** Mảng đối tượng ghi nhận tên lỗi, trích dẫn Gherkin sai, nguyên nhân và mức độ nghiêm trọng.
- **Khối Thành tựu (Best Artifacts):** Kịch bản Gherkin chuẩn nhất kèm giải thích lý do đạt chuẩn.
- **Khối Khuyến nghị (Action Items):** Mảng mục tiêu cải thiện cho phiên học tiếp theo.

## **5\. Logic Frontend & Giao diện (PWA)**

- **Layout Split-Screen:**
  - _Nửa trái (60%):_ AI Mentor Chatbox, bộ chọn tuần học động (weekSelector), thanh nhập liệu, và nút "Tổng kết (Recall)".
  - _Nửa phải (40%):_ Gherkin Editor và nút "Gửi Kịch bản".
- **Xử lý Dữ liệu (TypeScript):**
  - Đóng gói ScenarioPayload (currentWeek, scenarioText) gửi qua POST request tới /api/chat.
  - Tự động lưu nháp (sbe_draft) vào localStorage mỗi khi gõ phím để chống mất dữ liệu.
  - Phân rã JSON từ AI trả về để render thông báo chính, danh sách lỗi sai (chữ đỏ), và kịch bản đề xuất (code block) vào khung chat.
- **Service Worker & Offline:**
  - _Cache-First_ cho các tài nguyên tĩnh (/index.html, /js/index.js, /manifest.json) bằng sw.js thuần.
  - _Network-First_ với xử lý fallback cho API. Nếu rớt mạng khi gọi /api/, SW trả về JSON status: 503 (Lỗi Ngoại tuyến) để Frontend hiển thị cảnh báo thay vì sập trang. (Đã xóa bỏ src/sw.ts do xung đột TypeScript).

## **6\. Luồng CI/CD và Backend Serverless**

- **Cloudflare Native CI:** Toàn bộ luồng GitHub Actions (.github/workflows/deploy.yml) đã bị xóa bỏ để tránh xung đột. Cloudflare tự động lắng nghe nhánh main trên GitHub, chạy lệnh npm run build và đưa thư mục public lên Edge Network.
- **Bảo mật API Key:** GEMINI_API_KEY được lưu trong file .dev.vars (cho môi trường local Wrangler) và trong phần Environment Variables của Cloudflare Dashboard (cho production). File .dev.vars đã được xử lý xóa khỏi Git History thông qua git rm \--cached và git reset origin/main để vượt qua GitHub Push Protection.
- **Backend /api/chat:**
  - Nhận payload, khởi tạo systemPrompt chứa dữ liệu của người dùng theo currentWeek.
  - Gọi Gemini REST API với cấu hình response_mime_type: "application/json" để ép mô hình xuất định dạng chuẩn có chứa thuộc tính message, analysis.mistakes, và analysis.best_scenario.
  - Kiểm soát nhiệt độ (temperature: 0.2) để câu trả lời nhất quán.

## **7\. Trạng thái Tiến độ: Các Bước Tiếp Theo**

Dự án đã hoàn thiện 100% về mặt CI/CD, Frontend PWA, Service Worker, và kết nối LLM (Gemini API) cơ bản. Để hệ thống trở thành một "Mentor có trí nhớ" thực sự, cần triển khai các bước sau:

> 1. **Cấu hình Cloudflare D1 (Database):** Cài đặt bảng Memory_Blocks trên hệ thống Cloudflare và bind (liên kết) vào dự án Pages.
> 2. **Cập nhật Backend (/api/chat):** Bổ sung logic INSERT dữ liệu JSON trả về từ Gemini vào thẳng database D1 sau mỗi lượt phân tích thành công.
> 3. **Triển khai Endpoint RAG (/api/analyze):** Viết logic cho nút "Tổng kết (Recall)" để kéo toàn bộ lịch sử từ D1, gửi cho LLM tổng hợp tiến trình, và trả về Dashboard tiến độ học tập trên Frontend.
