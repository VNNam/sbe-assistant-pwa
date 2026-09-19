export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => ({}));
    const currentWeek = parseInt(payload.currentWeek, 10) || 1;
    const chosenModel = payload.model || "gemini-3.8-flash";

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "Chưa cấu hình GEMINI_API_KEY trong môi trường.",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!env.DB) {
      return new Response(
        JSON.stringify({
          error:
            "Cơ sở dữ liệu Cloudflare D1 chưa được liên kết (env.DB). Vui lòng kiểm tra wrangler.toml hoặc Dashboard.",
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
          // 503 High Demand: Chờ 600ms rồi thử lại
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

    if (!geminiResponse || !geminiResponse.ok) {
      const errText =
        lastErrText ||
        (geminiResponse
          ? await geminiResponse.text().catch(() => "")
          : "Unknown");
      const colo = request.cf?.colo || "Local";
      if (
        errText.includes("User location is not supported") ||
        errText.includes("FAILED_PRECONDITION")
      ) {
        console.error(
          `[Gemini Location Blocked in Recall] Colo: ${colo}, Error: ${errText}`,
        );
        return new Response(
          JSON.stringify({
            error:
              "Vị trí máy chủ chưa được Google Gemini API hỗ trợ (User location is not supported).",
            detail: `Cloudflare Edge Node đang thực thi tại trạm '${colo}'. Dự án đã bật cấu hình placement: { region: 'gcp:us-central1' } trong wrangler.jsonc. Hãy deploy bản mới nhất lên Cloudflare hoặc cấu hình GEMINI_BASE_URL (Cloudflare AI Gateway) để tự động chuyển tiếp qua Hoa Kỳ.`,
            isLocationBlocked: true,
            colo: colo,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      if (geminiResponse.status === 503) {
        return new Response(
          JSON.stringify({
            error:
              "Mô hình AI hiện đang quá tải trên hệ thống của Google (High Demand 503). Vui lòng thử lại sau giây lát hoặc chọn mô hình khác từ danh sách.",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(
        `Gemini API Error (${geminiResponse.status}): ${errText}`,
      );
    }

    const geminiData = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      throw new Error("Gemini không trả về nội dung hợp lệ.");
    }

    // Trích xuất JSON an toàn (hỗ trợ cả markdown code block hoặc preamble text)
    let parsedRecall: any;
    try {
      parsedRecall = JSON.parse(aiText.trim());
    } catch {
      const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        parsedRecall = JSON.parse(codeBlockMatch[1].trim());
      } else {
        const firstBrace = aiText.indexOf("{");
        const lastBrace = aiText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsedRecall = JSON.parse(
            aiText.substring(firstBrace, lastBrace + 1).trim(),
          );
        } else {
          throw new Error("Phản hồi không chứa cấu trúc JSON hợp lệ.");
        }
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
    return new Response(
      JSON.stringify({ error: "Lỗi máy chủ khi tổng kết: " + error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
