export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => ({}));
    const currentWeek = parseInt(payload.currentWeek, 10) || 1;

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

    // 4. Gọi Gemini REST API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
      throw new Error(`Gemini API Error: ${errText}`);
    }

    const geminiData = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      throw new Error("Gemini không trả về nội dung hợp lệ.");
    }

    // Làm sạch markdown code block (nếu có) trước khi parse JSON
    let cleanedText = aiText.trim();
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
    }
    const parsedRecall = JSON.parse(cleanedText);

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
