export async function onRequestGet(context: any) {
  const { env } = context;
  const apiKey = env.GEMINI_API_KEY;

  const fallbackModels = [
    { id: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash (Khuyến nghị)" },
    { id: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
  ];

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        models: fallbackModels,
        warning:
          "Chưa cấu hình GEMINI_API_KEY trong môi trường, trả về danh sách mặc định.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    // Truy vấn danh sách model hiện có trực tiếp từ Google Generative Language API
    const baseUrl = (
      env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com"
    ).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/v1beta/models?key=${apiKey}`, {
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const isLocation =
        errText.includes("User location is not supported") ||
        errText.includes("FAILED_PRECONDITION");
      const warnMsg = isLocation
        ? "Vị trí máy chủ chưa được Gemini hỗ trợ (Location Not Supported). Đang dùng danh sách model dự phòng."
        : `Google API trả về mã lỗi ${res.status}, dùng danh sách dự phòng.`;

      return new Response(
        JSON.stringify({
          models: fallbackModels,
          warning: warnMsg,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const data: any = await res.json();
    const rawList = data.models || [];

    // Lọc chỉ lấy các model hỗ trợ generateContent và thuộc họ gemini
    const models = rawList
      .filter((m: any) => {
        const methods = m.supportedGenerationMethods || [];
        const name = (m.name || "").toLowerCase();
        return (
          methods.includes("generateContent") &&
          name.includes("gemini") &&
          !name.includes("vision") &&
          !name.includes("embedding")
        );
      })
      .map((m: any) => {
        const id = m.name.replace(/^models\//, "");
        const displayName = m.displayName || id;
        return {
          id,
          displayName:
            id === "gemini-3.6-flash"
              ? `${displayName} (Khuyến nghị)`
              : displayName,
          description: m.description || "",
        };
      });

    // Đưa gemini-3.6-flash lên đầu danh sách
    models.sort((a: any, b: any) => {
      if (a.id === "gemini-3.6-flash") return -1;
      if (b.id === "gemini-3.6-flash") return 1;
      return a.id.localeCompare(b.id);
    });

    return new Response(
      JSON.stringify({
        models: models.length > 0 ? models : fallbackModels,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        models: fallbackModels,
        warning: "Lỗi kết nối tới Gemini API: " + error.message,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
