export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    // 1. Đọc payload từ Frontend gửi lên
    const payload = await request.json();
    const { currentWeek, scenarioText } = payload;

    if (!scenarioText) {
      return new Response(
        JSON.stringify({ error: "Thiếu nội dung kịch bản" }),
        { status: 400 },
      );
    }

    // TODO: Kết nối với Gemini API tại đây (Chúng ta sẽ làm ở bước sau)
    // const geminiApiKey = env.GEMINI_API_KEY;

    // 2. Tạm thời giả lập phản hồi của AI để test luồng dữ liệu
    const mockAIResponse = {
      message: `[Phản hồi từ Server] Tôi đã nhận được kịch bản Tuần ${currentWeek} của bạn. Kịch bản của bạn có độ dài ${scenarioText.length} ký tự.`,
      // Đây là cấu trúc JSON mà chúng ta sẽ yêu cầu AI trả về sau này
      analysis: {
        mistakes: ["Chưa kiểm tra được do đang chạy mock"],
        best_scenario: scenarioText,
      },
    };

    // 3. Trả kết quả về cho Frontend
    return new Response(JSON.stringify(mockAIResponse), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Lỗi xử lý máy chủ" }), {
      status: 500,
    });
  }
}
