export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => ({}));
    const { currentWeek = 1, scenarioText, message, model } = payload;
    const chosenModel = model || "gemini-3.6-flash";
    const userMessage = typeof message === "string" ? message.trim() : "";
    const scenarioContent =
      typeof scenarioText === "string" ? scenarioText.trim() : "";

    if (!scenarioContent && !userMessage) {
      return new Response(
        JSON.stringify({
          error: "Vui lòng nhập tin nhắn hoặc kịch bản Gherkin.",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Chưa cấu hình API Key (GEMINI_API_KEY)" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const isScenario = !!scenarioContent;

    // 1. Thiết lập System Prompt dựa trên chế độ (Đánh giá kịch bản hoặc Trò chuyện tự do)
    let systemPrompt = "";

    if (isScenario) {
      systemPrompt = `Bạn là SBE Mentor, một chuyên gia về Specification by Example.
      Khóa học có 4 tuần. Người học đang ở Tuần ${currentWeek}.
      Hãy phân tích kịch bản Gherkin sau của người học:
      ${scenarioContent}

      Trả về đúng cấu trúc JSON sau (chỉ JSON, không dùng markdown block):
      {
        "message": "Nhận xét ngắn gọn, chỉ ra điểm sáng và điểm cần cải thiện.",
        "analysis": {
          "learned_concepts": ["Khái niệm 1", "Khái niệm 2"],
          "mistakes": ["Lỗi sai 1", "Lỗi sai 2"],
          "best_scenario": "Viết lại kịch bản Gherkin một cách chuẩn xác nhất.",
          "recommendations": ["Lời khuyên hành động 1", "Lời khuyên 2"]
        }
      }`;
    } else {
      // Đọc tối đa 4 lượt chat gần nhất để làm giàu ngữ cảnh
      let recentChatContext = "";
      if (env.DB) {
        try {
          const query = await env.DB.prepare(
            "SELECT role, content FROM Chat_History WHERE week_id = ? ORDER BY id DESC LIMIT 4",
          )
            .bind(currentWeek)
            .all();
          const rows = query.results || [];
          if (rows.length > 0) {
            const reversed = [...rows].reverse();
            recentChatContext =
              "Lịch sử trao đổi gần nhất trong Tuần này:\n" +
              reversed
                .map(
                  (r: any) =>
                    `${r.role === "user" ? "Người học" : "SBE Mentor"}: ${r.content}`,
                )
                .join("\n") +
              "\n\n";
          }
        } catch (e) {
          console.warn("Lỗi đọc ngữ cảnh chat gần nhất:", e);
        }
      }

      const weekTopics: Record<number, string> = {
        1: "Tuần 1: Nền tảng Gherkin (Given - When - Then)",
        2: "Tuần 2: Scenario Outlines & Examples Tables",
        3: "Tuần 3: Outside-In & Edge Cases",
        4: "Tuần 4: Living Documentation & Refactoring",
      };
      const currentTopic = weekTopics[currentWeek] || `Tuần ${currentWeek}`;

      systemPrompt = `Bạn là SBE Mentor, một chuyên gia cố vấn về phương pháp Specification by Example (SBE) và cú pháp Gherkin.
      Chủ đề học hiện tại của học viên: ${currentTopic}.
      ${recentChatContext}Người học vừa gửi tin nhắn/câu hỏi sau:
      "${userMessage}"

      Hãy đóng vai trò một người thầy cố vấn (Mentor), trả lời ân cần, giải thích rõ ràng, súc tích và có tính sư phạm cao.
      Nếu câu hỏi liên quan đến lý thuyết SBE hoặc cách viết Gherkin, hãy giải thích kèm ví dụ trực quan.
      Trả về đúng cấu trúc JSON sau (chỉ JSON, không dùng markdown block):
      {
        "message": "Nội dung phản hồi hoàn chỉnh của Mentor (hỗ trợ markdown cơ bản nếu cần nhấn mạnh hoặc viết code ví dụ)."
      }`;
    }

    // 2. Gọi Gemini REST API
    const baseUrl = (
      env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"
    ).replace(/\/+$/, "");
    const geminiUrl = `${baseUrl}/v1beta/models/${chosenModel}:generateContent?key=${apiKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      const colo = request.cf?.colo || "Local";
      if (
        errText.includes("User location is not supported") ||
        errText.includes("FAILED_PRECONDITION")
      ) {
        console.error(
          `[Gemini Location Blocked] Colo: ${colo}, Error: ${errText}`,
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
      throw new Error(
        `Gemini API Error (${geminiResponse.status}): ${errText}`,
      );
    }

    const geminiData: any = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      throw new Error("Gemini không trả về nội dung hợp lệ.");
    }

    // Trích xuất JSON an toàn (hỗ trợ cả markdown code block hoặc preamble text)
    let parsedAIResponse: any;
    try {
      parsedAIResponse = JSON.parse(aiText.trim());
    } catch {
      const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        parsedAIResponse = JSON.parse(codeBlockMatch[1].trim());
      } else {
        const firstBrace = aiText.indexOf("{");
        const lastBrace = aiText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          parsedAIResponse = JSON.parse(
            aiText.substring(firstBrace, lastBrace + 1).trim(),
          );
        } else {
          // Fallback: nếu Gemini chỉ trả về text thuần
          parsedAIResponse = { message: aiText.trim() };
        }
      }
    }

    // Đảm bảo có message
    if (!parsedAIResponse.message && typeof parsedAIResponse === "string") {
      parsedAIResponse = { message: parsedAIResponse };
    }

    // 3. LƯU VÀO DATABASE CLOUDFLARE D1
    if (env.DB) {
      if (isScenario) {
        // Lưu lịch sử kịch bản và phân tích
        await env.DB.prepare(
          "INSERT INTO Chat_History (week_id, role, content) VALUES (?, ?, ?), (?, ?, ?)",
        )
          .bind(
            currentWeek,
            "user",
            scenarioContent,
            currentWeek,
            "model",
            parsedAIResponse.message || "",
          )
          .run();

        // Đóng gói dữ liệu Memory Block để lưu trữ dài hạn (RAG)
        const memoryBlock = {
          week: currentWeek,
          learned_concepts: parsedAIResponse.analysis?.learned_concepts || [],
          mistakes: parsedAIResponse.analysis?.mistakes || [],
          best_scenario: parsedAIResponse.analysis?.best_scenario || "",
          recommendations: parsedAIResponse.analysis?.recommendations || [],
        };

        await env.DB.prepare(
          "INSERT INTO Memory_Blocks (week_id, summary_json) VALUES (?, ?)",
        )
          .bind(currentWeek, JSON.stringify(memoryBlock))
          .run();
      } else {
        // Lưu lượt trò chuyện tự do
        await env.DB.prepare(
          "INSERT INTO Chat_History (week_id, role, content) VALUES (?, ?, ?), (?, ?, ?)",
        )
          .bind(
            currentWeek,
            "user",
            userMessage,
            currentWeek,
            "model",
            parsedAIResponse.message || "",
          )
          .run();
      }
    } else {
      console.warn(
        "Cảnh báo: Biến env.DB chưa được liên kết. Không thể lưu vào D1.",
      );
    }

    // 4. Trả kết quả về cho Frontend để hiển thị
    return new Response(
      JSON.stringify({
        type: isScenario ? "scenario" : "message",
        ...parsedAIResponse,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: "Lỗi máy chủ: " + error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
