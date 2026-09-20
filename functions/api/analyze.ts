import { logError, buildUserFacingError } from "./_logError";

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => ({}));
    const currentWeek = parseInt(payload.currentWeek, 10) || 1;
    const chosenModel = payload.model || "gemini-3.8-flash";

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      await logError(env.DB, {
        error_code: "LOGIC_500",
        source: "analyze.ts",
        action: "recall",
        model: chosenModel,
        week_id: currentWeek,
        http_status: 500,
        raw_error: "GEMINI_API_KEY không được cấu hình trong environment",
        colo: request.cf?.colo,
      });
      return new Response(
        JSON.stringify({
          errorCode: "ERR-500",
          error:
            "Đã xảy ra lỗi cấu hình dịch vụ. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({
          errorCode: "ERR-500",
          error:
            "Đã xảy ra lỗi cấu hình cơ sở dữ liệu. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 1. Truy vấn các khối bộ nhớ dài hạn từ D1 (từ tuần 1 đến tuần hiện tại)
    const query = await env.DB.prepare(
      "SELECT week_id, summary_json, created_at FROM Memory_Blocks WHERE week_id <= ? ORDER BY week_id ASC, id ASC",
    )
      .bind(currentWeek)
      .all();

    const rawRows = query.results || [];

    if (rawRows.length === 0) {
      return new Response(
        JSON.stringify({
          empty: true,
          message: `Chưa tìm thấy dữ liệu kịch bản nào được phân tích trong hoặc trước Tuần ${currentWeek}. Bạn hãy gửi ít nhất một kịch bản Gherkin để SBE Mentor có thể đánh giá và tổng kết tiến trình học tập!`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 2. Chuẩn hóa dữ liệu lịch sử
    const historyData = rawRows
      .map((row: any) => {
        try {
          return {
            week: row.week_id,
            created_at: row.created_at,
            summary: JSON.parse(row.summary_json),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // 3. Xây dựng Prompt tổng hợp RAG cho Gemini
    const systemPrompt = `Bạn là SBE Mentor - chuyên gia cao cấp hướng dẫn phương pháp Specification by Example (SBE) và BDD.
Người học đang yêu cầu "Tổng kết Tiến trình Học tập (Progress Recall)" tính đến Tuần ${currentWeek} của khóa học 4 tuần.

Dưới đây là các khối trí nhớ dài hạn (Memory Blocks) đã được ghi nhận từ các lượt phân tích kịch bản Gherkin thực tế của người học:
${JSON.stringify(historyData, null, 2)}

Hãy phân tích toàn diện lịch sử học tập trên và trả về kết quả bằng định dạng JSON thuần túy (không dùng markdown code blocks, không giải thích ngoài JSON):
{
  "overview": "Đánh giá tổng quan súc tích về thái độ, sự tiến bộ và khả năng áp dụng SBE của người học tính đến tuần hiện tại.",
  "readiness_score": 85,
  "mastered_concepts": [
    "Khái niệm hoặc kỹ thuật người học đã làm chủ kèm minh chứng cụ thể"
  ],
  "recurring_mistakes": [
    "Lỗi sai hoặc thói quen cũ còn lặp lại cần khắc phục triệt để"
  ],
  "action_plan": [
    "Kế hoạch hành động cụ thể hoặc bài tập khuyến nghị cho bước tiếp theo"
  ]
}
Lưu ý: "readiness_score" là số nguyên từ 0 đến 100 thể hiện mức độ thành thạo và sẵn sàng áp dụng SBE vào dự án thực tế.`;

    // 4. Gọi Gemini REST API với cơ chế Multi-Candidate Fallback & Retry
    const baseUrl = (
      env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"
    ).replace(/\/+$/, "");

    const requestPayload = {
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.2,
      },
    };

    // Chuẩn hóa model: nếu là model đã bị Google khai tử, tự động chuyển sang gemini-3.6-flash
    let initialModel = chosenModel;
    if (
      initialModel.includes("gemini-2.0-flash") ||
      initialModel.includes("gemini-2.5-flash")
    ) {
      initialModel = "gemini-3.6-flash";
    }

    const candidateModels = [initialModel];
    if (!candidateModels.includes("gemini-3.6-flash")) {
      candidateModels.push("gemini-3.6-flash");
    }
    if (!candidateModels.includes("gemini-1.5-flash")) {
      candidateModels.push("gemini-1.5-flash");
    }

    let geminiResponse: Response | null = null;
    let activeModel = initialModel;
    let lastErrText = "";

    for (const modelToTry of candidateModels) {
      activeModel = modelToTry;
      const geminiUrl = `${baseUrl}/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;

      for (let attempt = 0; attempt < 2; attempt++) {
        geminiResponse = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });

        if (geminiResponse.ok) break;

        if (geminiResponse.status === 503 && attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }

      if (geminiResponse && geminiResponse.ok) {
        break;
      }

      if (
        geminiResponse &&
        (geminiResponse.status === 404 || geminiResponse.status === 503)
      ) {
        lastErrText = await geminiResponse.text().catch(() => "");
        console.warn(
          `[Fallback in Recall] Model ${modelToTry} gặp HTTP ${geminiResponse.status}, chuyển sang candidate tiếp theo...`,
        );
        continue;
      }

      break;
    }

    // ─── Xử lý lỗi từ Gemini API: ghi log kỹ thuật + trả thông điệp thân thiện ───
    if (!geminiResponse || !geminiResponse.ok) {
      const errText =
        lastErrText ||
        (geminiResponse
          ? await geminiResponse.text().catch(() => "")
          : "Unknown");
      const httpStatus = geminiResponse?.status ?? 500;
      const colo = request.cf?.colo || "Local";

      let logCode = `HTTP_${httpStatus}`;
      if (httpStatus === 429 || errText.includes("RESOURCE_EXHAUSTED")) {
        logCode = "QUOTA_429";
      } else if (
        errText.includes("FAILED_PRECONDITION") ||
        errText.includes("User location is not supported")
      ) {
        logCode = "LOCATION_400";
      } else if (httpStatus === 404) {
        logCode = "MODEL_404";
      } else if (httpStatus === 503) {
        logCode = "OVERLOAD_503";
      } else if (httpStatus === 401 || httpStatus === 403) {
        logCode = "AUTH_401";
      }

      let retryAfter: number | undefined;
      if (httpStatus === 429) {
        const retryMatch = errText.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/);
        if (retryMatch) retryAfter = Math.ceil(parseFloat(retryMatch[1]));
      }

      await logError(env.DB, {
        error_code: logCode,
        source: "analyze.ts",
        action: "recall",
        model: activeModel,
        week_id: currentWeek,
        http_status: httpStatus,
        raw_error: errText,
        retry_after: retryAfter,
        colo,
      });

      const userErr = buildUserFacingError(httpStatus, errText);
      return new Response(
        JSON.stringify({
          errorCode: userErr.errorCode,
          error: userErr.userMessage,
          ...(userErr.retryAfterSeconds !== undefined && {
            retryAfterSeconds: userErr.retryAfterSeconds,
          }),
          ...(userErr.isQuota && { isQuota: true }),
        }),
        {
          status:
            httpStatus === 429
              ? 429
              : httpStatus >= 400 && httpStatus < 500
                ? 400
                : 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const geminiData = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      await logError(env.DB, {
        error_code: "LOGIC_500",
        source: "analyze.ts",
        action: "recall",
        model: activeModel,
        week_id: currentWeek,
        http_status: 200,
        raw_error:
          "Gemini trả HTTP 200 nhưng không có nội dung hợp lệ. Response: " +
          JSON.stringify(geminiData).substring(0, 500),
        colo: request.cf?.colo,
      });
      throw new Error("Gemini không trả về nội dung hợp lệ.");
    }

    // Trích xuất JSON an toàn (hỗ trợ cả markdown code block hoặc preamble text)
    let parsedRecall: any;
    try {
      parsedRecall = JSON.parse(aiText.trim());
    } catch {
      try {
        const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
          parsedRecall = JSON.parse(codeBlockMatch[1].trim());
        }
      } catch {
        /* bỏ qua */
      }

      if (!parsedRecall) {
        try {
          const firstBrace = aiText.indexOf("{");
          const lastBrace = aiText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            parsedRecall = JSON.parse(
              aiText.substring(firstBrace, lastBrace + 1).trim(),
            );
          }
        } catch {
          /* bỏ qua */
        }
      }

      if (!parsedRecall) {
        throw new Error("Phản hồi không chứa cấu trúc JSON hợp lệ.");
      }
    }

    return new Response(
      JSON.stringify({
        empty: false,
        week: currentWeek,
        total_blocks_analyzed: historyData.length,
        recall: parsedRecall,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    try {
      await logError(env.DB, {
        error_code: "LOGIC_500",
        source: "analyze.ts",
        action: "recall",
        http_status: 500,
        raw_error: error?.stack || error?.message || String(error),
        colo: request.cf?.colo,
      });
    } catch {
      /* không để lỗi log phá vỡ response */
    }

    return new Response(
      JSON.stringify({
        errorCode: "ERR-500",
        error:
          "Đã xảy ra lỗi trong quá trình tổng kết. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
