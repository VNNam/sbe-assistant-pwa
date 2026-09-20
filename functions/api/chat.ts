import { logError, buildUserFacingError } from "./_logError";

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const payload = await request.json().catch(() => ({}));
    const { currentWeek = 1, scenarioText, message, model } = payload;
    const chosenModel = model || "gemini-3.8-flash";
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
      await logError(env.DB, {
        error_code: "LOGIC_500",
        source: "chat.ts",
        action: scenarioContent ? "sendScenario" : "sendChat",
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

    const isScenario = !!scenarioContent;
    const actionLabel = isScenario ? "sendScenario" : "sendChat";

    // 1. Thiết lập System Prompt dựa trên chế độ (Đánh giá kịch bản hoặc Trò chuyện tự do)
    let systemPrompt = "";

    if (isScenario) {
      // Phân cấp tiêu chí đánh giá theo tuần học
      const weekRubric = currentWeek <= 2
        ? `=== TIÊU CHÍ TUẦN ${currentWeek} (Cơ bản — Chương 3-6) ===
[F1] Feature title: Phải là tên TÍNH NĂNG NGHIỆP VỤ, không phải tên kỹ thuật. VD tốt: "User Login". VD xấu: "Authentication Module".
[G1] Given (Ngữ cảnh): Chỉ mô tả trạng thái/ngữ cảnh ban đầu. KHÔNG chứa hành động. Dùng thì hiện tại hoặc quá khứ hoàn thành.
[W1] When (Hành động): Chỉ được có MỘT hành động duy nhất mỗi scenario. Dùng active voice.
[T1] Then (Kết quả): Phải mô tả kết quả CÓ THỂ QUAN SÁT và đủ cụ thể. Không được mơ hồ.
[S1] Độ dài: Scenario tốt thường có 3-7 steps. Trên 10 steps = Scenario Pollution (quá tải).`
        : `=== TIÊU CHÍ TUẦN ${currentWeek} (Nâng cao — Chương 3-8, ĐẦY ĐỦ) ===
[F1] Feature title: Phải là tên TÍNH NĂNG NGHIỆP VỤ, không phải tên kỹ thuật.
[G1] Given: Chỉ ngữ cảnh, KHÔNG chứa action. Dùng thì hiện tại/quá khứ hoàn thành.
[W1] When: MỘT hành động duy nhất. Active voice. Không dùng AND trong When.
[T1] Then: Kết quả quan sát được, đủ cụ thể. Không mơ hồ.
[S1] Độ dài: 3-7 steps lý tưởng. Trên 10 steps = Scenario Pollution.
[A1] ANTI-PATTERN "Incidental Details" (Ch.7): Không thêm chi tiết kỹ thuật không cần thiết (ID số, URL, màu sắc button, tên field).
[A2] ANTI-PATTERN "UI-Centered" (Ch.7): Không mô tả thao tác UI. Dùng intent nghiệp vụ. Xấu: "clicks Submit button". Tốt: "submits the form".
[A3] ANTI-PATTERN "Conjunction Steps" (Ch.7): Mỗi step làm một việc duy nhất. Không dùng "AND" nối 2 action trong 1 step.
[A4] ANTI-PATTERN "Vague Steps" (Ch.7): Mỗi step phải đủ cụ thể và có thể kiểm chứng. Tránh "some data", "valid information".
[D1] Declarative Style (Ch.6): Mô tả WHAT (cái gì xảy ra), không HOW (làm như thế nào từng bước UI).
[U1] Ubiquitous Language (Ch.3): Dùng thuật ngữ domain từ nghiệp vụ. Tránh từ kỹ thuật: database, API, null, boolean, query.`;

      systemPrompt = `Bạn là SBE Mentor — chuyên gia đánh giá kịch bản Gherkin theo tiêu chuẩn của cuốn sách "Writing Great Specifications Using Specification by Example and Gherkin" (Kamil Nicieja, Manning Publications, 2017).
Người học đang ở Tuần ${currentWeek} của khóa học 4 tuần.

${weekRubric}

Kịch bản Gherkin cần đánh giá:
\`\`\`gherkin
${scenarioContent}
\`\`\`

Hãy phân tích nghiêm túc kịch bản trên theo từng tiêu chí phù hợp với tuần học. Với mỗi vi phạm tìm thấy, chỉ rõ: mã tiêu chí, step cụ thể vi phạm, giải thích tại sao vi phạm (kèm tham chiếu chương sách nếu có), và cách sửa đúng.

QUAN TRỌNG: Chỉ trả về JSON thuần túy, bắt đầu bằng { và kết thúc bằng }. Không có markdown, không có text bên ngoài JSON.

Cấu trúc JSON bắt buộc:
{
  "message": "Nhận xét tổng quan ngắn gọn: điểm mạnh và vấn đề chính cần cải thiện.",
  "analysis": {
    "style_score": 75,
    "learned_concepts": ["Tên khái niệm đã áp dụng đúng theo sách"],
    "violations": [
      {
        "code": "[A2]",
        "severity": "major",
        "step": "When user clicks the Submit button",
        "explanation": "UI-Centered: Bước này mô tả thao tác UI thay vì intent nghiệp vụ (Manning Ch.7, tr.89). Feature file nên mô tả WHAT, không HOW.",
        "fix": "When user submits the registration form"
      }
    ],
    "mistakes": ["Mô tả ngắn gọn lỗi sai chính (tương thích với bản cũ)"],
    "best_scenario": "Toàn bộ kịch bản Gherkin được viết lại đúng chuẩn Manning.",
    "recommendations": ["Lời khuyên hành động cụ thể để cải thiện"]
  }
}

Quy tắc cho các trường:
- "style_score": Số nguyên 0-100. 90-100 = Xuất sắc. 70-89 = Tốt. 50-69 = Cần cải thiện. <50 = Cần viết lại.
- "violations[].severity": "major" (vi phạm cấu trúc Given/When/Then, anti-pattern nặng) hoặc "minor" (vi phạm style, ngôn ngữ).
- "violations": Mảng rỗng [] nếu không có vi phạm.
- "best_scenario": Bắt buộc phải có — viết lại kịch bản theo chuẩn Manning đầy đủ.`;
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

      QUAN TRỌNG - QUY TẮC PHẢN HỒI BẮT BUỘC:
      - Chỉ trả về một object JSON hợp lệ, bắt đầu bằng dấu { và kết thúc bằng dấu }.
      - TUYỆT ĐỐI không thêm bất kỳ text nào bên ngoài JSON (không có "gherkin", không có "Feature:", không có markdown code block như \`\`\`json, không có lời dẫn, không có giải thích sau JSON).
      - Cấu trúc JSON bắt buộc:
      {"message": "Nội dung phản hồi hoàn chỉnh của Mentor (hỗ trợ markdown cơ bản nếu cần nhấn mạnh hoặc viết code ví dụ)."}`;
    }

    // 2. Gọi Gemini REST API với cơ chế Multi-Candidate Fallback & Retry
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
          `[Fallback] Model ${modelToTry} gặp HTTP ${geminiResponse.status}, chuyển sang candidate tiếp theo...`,
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

      // Xác định error_code để ghi log
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

      // Trích xuất retry_after từ lỗi 429
      let retryAfter: number | undefined;
      if (httpStatus === 429) {
        const retryMatch = errText.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/);
        if (retryMatch) retryAfter = Math.ceil(parseFloat(retryMatch[1]));
      }

      // Ghi log kỹ thuật vào D1 (KHÔNG gửi về client)
      await logError(env.DB, {
        error_code: logCode,
        source: "chat.ts",
        action: actionLabel,
        model: activeModel,
        week_id: currentWeek,
        http_status: httpStatus,
        raw_error: errText,
        retry_after: retryAfter,
        colo,
      });

      // Trả thông điệp thân thiện về client
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

    const geminiData: any = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!aiText) {
      await logError(env.DB, {
        error_code: "LOGIC_500",
        source: "chat.ts",
        action: actionLabel,
        model: activeModel,
        week_id: currentWeek,
        http_status: 200,
        raw_error:
          "Gemini trả HTTP 200 nhưng không có candidates[0].content.parts[0].text. Response: " +
          JSON.stringify(geminiData).substring(0, 500),
        colo: request.cf?.colo,
      });
      throw new Error("Gemini không trả về nội dung hợp lệ.");
    }

    // Trích xuất JSON an toàn - đa lớp fallback để chống lỗi trên Safari iOS
    let parsedAIResponse: any = null;

    // Lớp 1: Parse trực tiếp (trường hợp lý tưởng)
    try {
      parsedAIResponse = JSON.parse(aiText.trim());
    } catch {
      // Lớp 2: Tìm markdown code block ```json ... ```
      try {
        const codeBlockMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (codeBlockMatch && codeBlockMatch[1]) {
          parsedAIResponse = JSON.parse(codeBlockMatch[1].trim());
        }
      } catch {
        /* bỏ qua, thử lớp tiếp theo */
      }

      // Lớp 3: Tìm JSON object đầu tiên trong text (xử lý preamble text như "gherkin\n{...")
      if (!parsedAIResponse) {
        try {
          const firstBrace = aiText.indexOf("{");
          const lastBrace = aiText.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            parsedAIResponse = JSON.parse(
              aiText.substring(firstBrace, lastBrace + 1).trim(),
            );
          }
        } catch {
          /* bỏ qua, thử lớp tiếp theo */
        }
      }

      // Lớp 4: Cuối cùng — bọc toàn bộ text thô vào { message }
      if (!parsedAIResponse) {
        parsedAIResponse = { message: aiText.trim() };
      }
    }

    // Đảm bảo luôn có trường message
    if (typeof parsedAIResponse === "string") {
      parsedAIResponse = { message: parsedAIResponse };
    } else if (!parsedAIResponse || typeof parsedAIResponse !== "object") {
      parsedAIResponse = { message: String(aiText).trim() };
    } else if (!parsedAIResponse.message) {
      parsedAIResponse.message =
        parsedAIResponse.text || parsedAIResponse.content || aiText.trim();
    }

    // 3. LƯU VÀO DATABASE CLOUDFLARE D1
    if (env.DB) {
      if (isScenario) {
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
    // Lỗi runtime/logic không mong muốn — ghi log kỹ thuật, trả thông điệp thân thiện
    try {
      await logError(env.DB, {
        error_code: "LOGIC_500",
        source: "chat.ts",
        action: "unknown",
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
          "Đã xảy ra lỗi trong quá trình xử lý yêu cầu. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
