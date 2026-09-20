/**
 * _logError.ts — Tiện ích ghi log lỗi vào D1 và ánh xạ lỗi kỹ thuật → thông điệp thân thiện
 *
 * Nguyên tắc bảo mật:
 * - `raw_error` (thông tin kỹ thuật) chỉ được lưu vào D1 database, KHÔNG BAO GIỜ gửi về client.
 * - Client chỉ nhận `errorCode` + `userMessage` (thông điệp thân thiện).
 */

// ─────────────────────────────────────────────
// Kiểu dữ liệu
// ─────────────────────────────────────────────

export interface ErrorLogEntry {
  error_code: string; // VD: "QUOTA_429", "LOCATION_400", "LOGIC_500"
  source: string; // VD: "chat.ts", "analyze.ts"
  action?: string; // VD: "sendScenario", "sendChat", "recall"
  model?: string; // Model đang dùng lúc lỗi xảy ra
  week_id?: number; // Tuần học đang thực hiện
  http_status?: number; // Mã HTTP từ Gemini API
  raw_error?: string; // Toàn bộ error text/JSON kỹ thuật (chỉ lưu DB)
  retry_after?: number; // Giây cần chờ (cho lỗi 429)
  colo?: string; // Cloudflare edge node
}

export interface UserFacingError {
  errorCode: string; // Mã lỗi ngắn gọn, VD: "ERR-429"
  userMessage: string; // Thông điệp thân thiện hiển thị lên UI
  retryAfterSeconds?: number; // Nếu có, cho phép UI đếm ngược & retry
  isQuota?: boolean; // true nếu là lỗi hết quota
  isOffline?: boolean; // true nếu là lỗi mất kết nối
}

// ─────────────────────────────────────────────
// Hàm ghi log vào D1
// ─────────────────────────────────────────────

export async function logError(db: any, entry: ErrorLogEntry): Promise<void> {
  if (!db) return; // Graceful: không crash nếu DB chưa được bind
  try {
    await db
      .prepare(
        `INSERT INTO Error_Logs
          (error_code, source, action, model, week_id, http_status, raw_error, retry_after, colo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.error_code,
        entry.source,
        entry.action ?? null,
        entry.model ?? null,
        entry.week_id ?? null,
        entry.http_status ?? null,
        // Giới hạn 4000 ký tự để tránh blob quá lớn trong D1
        entry.raw_error ? entry.raw_error.substring(0, 4000) : null,
        entry.retry_after ?? null,
        entry.colo ?? null,
      )
      .run();
  } catch (e) {
    // Không để lỗi log phá vỡ luồng chính — chỉ ghi console
    console.error("[logError] Không thể ghi vào Error_Logs:", e);
  }
}

// ─────────────────────────────────────────────
// Hàm ánh xạ lỗi kỹ thuật → thông điệp thân thiện
// ─────────────────────────────────────────────

export function buildUserFacingError(
  httpStatus: number,
  rawErrorText: string,
): UserFacingError {
  // 429 — Quota hết (RESOURCE_EXHAUSTED)
  if (httpStatus === 429 || rawErrorText.includes("RESOURCE_EXHAUSTED")) {
    const retryMatch = rawErrorText.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/);
    const retrySec = retryMatch
      ? Math.ceil(parseFloat(retryMatch[1]))
      : undefined;
    return {
      errorCode: "ERR-429",
      userMessage:
        "Hệ thống AI tạm thời không thể xử lý yêu cầu do đạt giới hạn sử dụng trong ngày." +
        (retrySec
          ? ` Vui lòng thử lại sau ${retrySec} giây.`
          : " Vui lòng thử lại sau ít phút.") +
        " Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
      retryAfterSeconds: retrySec,
      isQuota: true,
    };
  }

  // 400 — Địa lý bị chặn (FAILED_PRECONDITION / User location not supported)
  if (
    rawErrorText.includes("FAILED_PRECONDITION") ||
    rawErrorText.includes("User location is not supported")
  ) {
    return {
      errorCode: "ERR-400-GEO",
      userMessage:
        "Dịch vụ AI chưa khả dụng tại khu vực máy chủ hiện tại. " +
        "Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
    };
  }

  // 401 / 403 — API Key sai hoặc hết hạn
  if (httpStatus === 401 || httpStatus === 403) {
    return {
      errorCode: `ERR-${httpStatus}-AUTH`,
      userMessage:
        "Xác thực dịch vụ AI thất bại. " +
        "Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
    };
  }

  // 404 — Model không tồn tại / đã bị deprecated
  if (httpStatus === 404) {
    return {
      errorCode: "ERR-404-MODEL",
      userMessage:
        "Mô hình AI được chọn không còn khả dụng. " +
        "Hãy chọn mô hình khác từ danh sách hoặc liên hệ nhà cung cấp dịch vụ.",
    };
  }

  // 503 — Quá tải
  if (httpStatus === 503) {
    return {
      errorCode: "ERR-503",
      userMessage:
        "Hệ thống AI đang quá tải. " +
        "Vui lòng thử lại sau vài giây hoặc chọn mô hình AI khác từ danh sách.",
    };
  }

  // 500 / Mặc định — Lỗi logic hoặc runtime
  return {
    errorCode: `ERR-${httpStatus || 500}`,
    userMessage:
      "Đã xảy ra lỗi trong quá trình xử lý yêu cầu. " +
      "Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
  };
}
