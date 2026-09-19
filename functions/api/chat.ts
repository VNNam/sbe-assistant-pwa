export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const { currentWeek, scenarioText } = payload;

    if (!scenarioText) {
      return new Response(
        JSON.stringify({ error: "Thiếu nội dung kịch bản" }),
        { status: 400 },
      );
    }

    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Chưa cấu hình API Key" }), {
        status: 500,
      });
    }

    // 1. Thiết lập Prompt ép kiểu JSON 5 khối cho AI
    const systemPrompt = `Bạn là SBE Mentor, một chuyên gia về Specification by Example.
    Khóa học có 4 tuần. Người học đang ở Tuần ${currentWeek}.
    Hãy phân tích kịch bản Gherkin sau của người học:
    ${scenarioText}

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

    // 2. Gọi Gemini REST API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
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
      const err = await geminiResponse.text();
      throw new Error(`Gemini API Error: ${err}`);
    }

    const geminiData = await geminiResponse.json();
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
          throw new Error("Phản hồi không chứa cấu trúc JSON hợp lệ.");
        }
      }
    }

    // 3. Đóng gói dữ liệu Memory Block để lưu trữ
    const memoryBlock = {
      week: currentWeek,
      learned_concepts: parsedAIResponse.analysis?.learned_concepts || [],
      mistakes: parsedAIResponse.analysis?.mistakes || [],
      best_scenario: parsedAIResponse.analysis?.best_scenario || "",
      recommendations: parsedAIResponse.analysis?.recommendations || [],
    };

    // 4. LƯU VÀO DATABASE CLOUDFLARE D1
    if (env.DB) {
      // Lưu lịch sử chat ngắn hạn
      await env.DB.prepare(
        "INSERT INTO Chat_History (week_id, role, content) VALUES (?, ?, ?), (?, ?, ?)",
      )
        .bind(
          currentWeek,
          "user",
          scenarioText,
          currentWeek,
          "model",
          parsedAIResponse.message,
        )
        .run();

      // Lưu khối trí nhớ dài hạn (RAG)
      await env.DB.prepare(
        "INSERT INTO Memory_Blocks (week_id, summary_json) VALUES (?, ?)",
      )
        .bind(currentWeek, JSON.stringify(memoryBlock))
        .run();
    } else {
      console.warn(
        "Cảnh báo: Biến env.DB chưa được liên kết. Không thể lưu vào D1.",
      );
    }

    // 5. Trả kết quả về cho Frontend để hiển thị
    return new Response(JSON.stringify(parsedAIResponse), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Lỗi máy chủ: " + error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
