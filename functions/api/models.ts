export async function onRequestGet(context: any) {
  const { env } = context;
  const apiKey = env.GEMINI_API_KEY;

  const fallbackModels = [
    {
      id: "gemini-3.8-flash",
      displayName: "Gemini 3.8 Flash (Mới nhất - Mặc định)",
    },
    {
      id: "gemini-3.6-flash",
      displayName: "Gemini 3.6 Flash (Khuyến nghị từ Google)",
    },
    {
      id: "gemini-1.5-flash",
      displayName: "Gemini 1.5 Flash (Dự phòng ổn định)",
    },
    { id: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
  ];

  function extractVersion(id: string): number {
    const match = id.match(/gemini-(\d+(?:\.\d+)?)/i);
    return match ? parseFloat(match[1]) : 0;
  }

  if (!apiKey) {
    return new Response(
      JSON.stringify({
        models: fallbackModels,
        defaultModel: fallbackModels[0].id,
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
          defaultModel: fallbackModels[0].id,
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

    // Lọc chỉ lấy các model hỗ trợ generateContent, thuộc họ gemini và LOẠI BỎ các model đã bị Google khai tử
    const models: any[] = rawList
      .filter((m: any) => {
        const methods = m.supportedGenerationMethods || [];
        const name = (m.name || "").toLowerCase();
        const isDeprecated =
          name.includes("gemini-2.0-flash") ||
          name.includes("gemini-2.5-flash");
        return (
          methods.includes("generateContent") &&
          name.includes("gemini") &&
          !name.includes("vision") &&
          !name.includes("embedding") &&
          !isDeprecated
        );
      })
      .map((m: any) => {
        const id = m.name.replace(/^models\//, "");
        const displayName = m.displayName || id;
        return {
          id,
          displayName,
          description: m.description || "",
        };
      });

    // Đảm bảo gemini-3.8-flash luôn hiện diện trong danh sách
    if (!models.some((m) => m.id === "gemini-3.8-flash")) {
      models.push({
        id: "gemini-3.8-flash",
        displayName: "Gemini 3.8 Flash",
        description: "Google Gemini 3.8 Flash latest fast multimodal model.",
      });
    }

    // Đảm bảo gemini-3.6-flash (chuẩn Google) luôn hiện diện
    if (!models.some((m) => m.id === "gemini-3.6-flash")) {
      models.push({
        id: "gemini-3.6-flash",
        displayName: "Gemini 3.6 Flash",
        description: "Google Gemini 3.6 Flash recommended model.",
      });
    }

    // Sắp xếp model: Flash lên trước (theo phiên bản cao nhất đến thấp nhất), sau đó là các model khác
    models.sort((a: any, b: any) => {
      const aIsFlash = a.id.toLowerCase().includes("flash");
      const bIsFlash = b.id.toLowerCase().includes("flash");

      if (aIsFlash && !bIsFlash) return -1;
      if (!aIsFlash && bIsFlash) return 1;

      // Cả hai cùng là Flash hoặc cùng không phải Flash: so sánh theo version số
      const vA = extractVersion(a.id);
      const vB = extractVersion(b.id);
      if (vA !== vB) {
        return vB - vA; // Phiên bản cao hơn xếp trước
      }

      return a.id.localeCompare(b.id);
    });

    // Định dạng nhãn hiển thị cho model
    const highestFlashModelId = models.find((m) =>
      m.id.toLowerCase().includes("flash"),
    )?.id;

    models.forEach((m) => {
      const cleanName = m.displayName.replace(
        /\s*\((Mới nhất - Mặc định|Khuyến nghị từ Google|Dự phòng ổn định|Tải cao)\)/g,
        "",
      );
      if (m.id === highestFlashModelId) {
        m.displayName = `${cleanName} (Mới nhất - Mặc định)`;
      } else if (m.id === "gemini-3.6-flash") {
        m.displayName = `${cleanName} (Khuyến nghị từ Google)`;
      } else if (m.id === "gemini-1.5-flash") {
        m.displayName = `${cleanName} (Dự phòng ổn định)`;
      } else {
        m.displayName = cleanName;
      }
    });

    const defaultModel =
      highestFlashModelId || models[0]?.id || "gemini-3.8-flash";

    return new Response(
      JSON.stringify({
        models: models.length > 0 ? models : fallbackModels,
        defaultModel,
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
        defaultModel: fallbackModels[0].id,
        warning: "Lỗi kết nối tới Gemini API: " + error.message,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
