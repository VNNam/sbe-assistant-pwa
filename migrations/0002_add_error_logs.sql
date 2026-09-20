-- Phase 18: Tạo bảng Error_Logs để ghi nhật ký lỗi kỹ thuật
-- Chạy: npx wrangler d1 execute sbe-memory-db --remote --file=migrations/0002_add_error_logs.sql

CREATE TABLE IF NOT EXISTS Error_Logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  error_code  TEXT    NOT NULL,          -- VD: "QUOTA_429", "LOCATION_400", "LOGIC_500"
  source      TEXT    NOT NULL,          -- VD: "chat.ts", "analyze.ts"
  action      TEXT,                      -- VD: "sendScenario", "sendChat", "recall"
  model       TEXT,                      -- Model đang dùng khi lỗi phát sinh
  week_id     INTEGER,                   -- Tuần học đang thực hiện
  http_status INTEGER,                   -- Mã HTTP thực tế từ Gemini API
  raw_error   TEXT,                      -- Toàn bộ error JSON gốc (chỉ lưu DB, không gửi client)
  retry_after INTEGER,                   -- Giây cần chờ (từ RetryInfo trong lỗi 429)
  colo        TEXT                       -- Cloudflare edge node (VD: "SIN", "LAX", "ORD")
);

CREATE INDEX IF NOT EXISTS idx_error_logs_code ON Error_Logs(error_code);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON Error_Logs(created_at);

