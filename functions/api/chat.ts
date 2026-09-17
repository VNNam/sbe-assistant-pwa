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
      return new Response(
        JSON.stringify({ error: "Chưa cấu hình API Key trên Cloudflare" }),
        { status: 500 },
      );
    }

    // 1. Thiết lập System Prompt đóng vai trò SBE Mentor
    const systemPrompt = `Bạn là SBE Mentor, một chuyên gia về Specification by Example và Gherkin.
Khóa học có 4 tuần. Người học đang ở Tuần ${currentWeek}.
Hãy đánh giá kịch bản Gherkin sau đây của người học:
"""
${scenarioText}
"""
Trả về cấu trúc JSON sau (không chứa markdown code block, chỉ trả về JSON thuần):
{
  "message": "Nhận xét ngắn gọn, chỉ ra điểm sáng và điểm cần cải thiện dựa trên tư duy SBE (dưới 60 từ).",
  "analysis": {
    "mistakes": ["Lỗi 1 (ví dụ: gộp quá nhiều bước When)", "Lỗi 2 (nếu có)"],
    "best_scenario": "Viết lại kịch bản Gherkin này một cách chuẩn xác, tối ưu hóa theo nguyên tắc SBE."
  }
}`;

    // 2. Gọi Gemini REST API (sử dụng model 2.5-flash để tối ưu tốc độ)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2, // Giảm độ ngẫu nhiên để AI tập trung vào logic Gherkin
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errData = await geminiResponse.text();
      throw new Error(`Gemini API Error: ${errData}`);
    }

    const geminiData = await geminiResponse.json();

    // 3. Trích xuất văn bản JSON từ phản hồi của AI
    const aiText = geminiData.candidates[0].content.parts[0].text;
    const parsedAIResponse = JSON.parse(aiText);

    // 4. Trả kết quả về cho Front-end
    return new Response(JSON.stringify(parsedAIResponse), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "Lỗi xử lý máy chủ: " + error.message }),
      { status: 500 },
    );
  }
}
