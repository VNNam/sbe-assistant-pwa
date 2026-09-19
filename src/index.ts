interface ScenarioPayload {
  currentWeek: number;
  scenarioText: string;
  model?: string;
}

const btnSend = document.getElementById("btnSendScenario") as HTMLButtonElement;
const btnRecall = document.getElementById("btnRecall") as HTMLButtonElement;
const gherkinEditor = document.getElementById(
  "gherkinEditor",
) as HTMLTextAreaElement;
const chatHistory = document.getElementById("chatHistory") as HTMLDivElement;
const weekSelector = document.getElementById(
  "weekSelector",
) as HTMLSelectElement;
const modelSelector = document.getElementById(
  "modelSelector",
) as HTMLSelectElement;
const chatInput = document.getElementById("chatInput") as HTMLInputElement;
const btnSendChat = document.getElementById("btnSendChat") as HTMLButtonElement;

// Tự động khôi phục bản nháp từ LocalStorage khi mở lại web
const savedDraft = localStorage.getItem("sbe_draft");
if (savedDraft) {
  gherkinEditor.value = savedDraft;
}

// Lưu nháp mỗi khi người dùng gõ phím
gherkinEditor.addEventListener("input", () => {
  localStorage.setItem("sbe_draft", gherkinEditor.value);
});

// Tải danh sách model Gemini khả dụng từ backend
async function loadAvailableModels() {
  if (!modelSelector) return;
  const savedModel =
    localStorage.getItem("sbe_selected_model") || "gemini-3.6-flash";

  try {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models: Array<{ id: string; displayName: string }> =
      data.models || [];

    if (models.length > 0) {
      modelSelector.innerHTML = "";
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.displayName || m.id;
        if (m.id === savedModel) {
          opt.selected = true;
        }
        modelSelector.appendChild(opt);
      });

      // Nếu model lưu trước đó không tồn tại trong danh sách mới, chọn model đầu tiên
      if (!models.some((m) => m.id === savedModel)) {
        modelSelector.value = models[0].id;
        localStorage.setItem("sbe_selected_model", models[0].id);
      }
    }
  } catch (err) {
    console.warn(
      "Không thể tải danh sách model động từ /api/models, dùng model dự phòng:",
      err,
    );
    modelSelector.value = savedModel;
  }
}

if (modelSelector) {
  modelSelector.addEventListener("change", () => {
    localStorage.setItem("sbe_selected_model", modelSelector.value);
  });
}

// Khởi chạy nạp danh sách model
loadAvailableModels();

function appendMessage(sender: string, htmlContent: string, isSystem = false) {
  const msgElement = document.createElement("div");
  msgElement.style.color = isSystem ? "#d9534f" : "#333";
  msgElement.style.marginBottom = "15px";
  msgElement.innerHTML = `<strong>${sender}:</strong> <div style="margin-top: 5px;">${htmlContent}</div>`;
  chatHistory.appendChild(msgElement);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatMentorMarkdown(raw: string): string {
  if (!raw) return "";
  // Xử lý code block ```...```
  let html = raw.replace(/```(?:[a-z]*)\n([\s\S]*?)```/gi, (_match, code) => {
    return `<pre style="background: #e9ecef; padding: 10px; border-radius: 4px; overflow-x: auto; color: #1e1e1e; margin: 8px 0;"><code>${escapeHtml(code.trim())}</code></pre>`;
  });
  // Xử lý inline code `...`
  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    return `<code style="background: #e9ecef; padding: 2px 5px; border-radius: 3px; color: #d63384;">${escapeHtml(code)}</code>`;
  });
  // Xử lý in đậm **...**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Xử lý xuống dòng
  html = html
    .replace(/\n\n+/g, "</p><p style='margin-top: 6px;'>")
    .replace(/\n/g, "<br/>");
  return `<p style="margin: 0; line-height: 1.5;">${html}</p>`;
}

async function sendChatMessage() {
  if (!chatInput) return;
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  chatInput.disabled = true;
  if (btnSendChat) {
    btnSendChat.disabled = true;
    btnSendChat.textContent = "...";
  }

  const currentWeek = parseInt(weekSelector.value, 10) || 1;
  const selectedModel =
    modelSelector?.value ||
    localStorage.getItem("sbe_selected_model") ||
    "gemini-3.6-flash";

  appendMessage("Bạn", `<p style="margin: 0;">${escapeHtml(text)}</p>`);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentWeek,
        message: text,
        model: selectedModel,
      }),
    });

    if (!response.ok) {
      if (response.status === 503) throw new Error("OFFLINE");
      const errJson = await response.json().catch(() => ({}));
      if (
        errJson.isLocationBlocked ||
        (errJson.error &&
          (errJson.error.includes("location") ||
            errJson.error.includes("Vị trí máy chủ")))
      ) {
        const locationWarningHtml = `
          <div style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 12px; border-radius: 6px;">
            <strong>⚠ Hạn chế Địa lý từ Google Gemini API:</strong>
            <p style="margin: 6px 0;">${errJson.error}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #664d03;">${errJson.detail || "Cloudflare Edge Node đang ở vùng bị Google chặn. Dự án đã kích hoạt cấu hình placement trong wrangler.jsonc."}</p>
          </div>
        `;
        appendMessage("Hệ thống", locationWarningHtml, true);
        return;
      }
      throw new Error(errJson.error || `Lỗi máy chủ (${response.status})`);
    }

    const data = await response.json();
    const replyHtml = formatMentorMarkdown(
      data.message || "Đã nhận được tin nhắn.",
    );
    appendMessage("SBE Mentor", replyHtml);
  } catch (error: any) {
    if (error.message === "OFFLINE") {
      appendMessage(
        "Hệ thống",
        "Bạn đang mất kết nối mạng. Tin nhắn chưa được gửi.",
        true,
      );
    } else {
      appendMessage("Hệ thống", "Lỗi trò chuyện: " + error.message, true);
    }
  } finally {
    chatInput.disabled = false;
    if (btnSendChat) {
      btnSendChat.disabled = false;
      btnSendChat.textContent = "Gửi";
    }
    chatInput.focus();
  }
}

if (chatInput) {
  chatInput.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
}

if (btnSendChat) {
  btnSendChat.addEventListener("click", () => {
    sendChatMessage();
  });
}

btnSend.addEventListener("click", async () => {
  const text = gherkinEditor.value.trim();
  if (!text) {
    alert("Vui lòng viết kịch bản Gherkin vào ô bên phải trước khi gửi!");
    return;
  }

  btnSend.disabled = true;
  btnSend.textContent = "Đang xử lý...";
  const currentWeek = parseInt(weekSelector.value);

  appendMessage(
    "Bạn",
    `<pre style="background: #f4f4f4; padding: 8px; border-radius: 4px;">${text}</pre>`,
  );

  const selectedModel =
    modelSelector?.value ||
    localStorage.getItem("sbe_selected_model") ||
    "gemini-3.6-flash";

  const payload: ScenarioPayload = {
    currentWeek: currentWeek,
    scenarioText: text,
    model: selectedModel,
  };

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 503) throw new Error("OFFLINE");
      const errJson = await response.json().catch(() => ({}));
      if (
        errJson.isLocationBlocked ||
        (errJson.error &&
          (errJson.error.includes("location") ||
            errJson.error.includes("Vị trí máy chủ")))
      ) {
        const locationWarningHtml = `
          <div style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 12px; border-radius: 6px;">
            <strong>⚠ Hạn chế Địa lý từ Google Gemini API:</strong>
            <p style="margin: 6px 0;">${errJson.error}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #664d03;">${errJson.detail || "Cloudflare Edge Node đang ở vùng bị Google chặn. Dự án đã kích hoạt cấu hình placement trong wrangler.jsonc."}</p>
          </div>
        `;
        appendMessage("Hệ thống", locationWarningHtml, true);
        return;
      }
      throw new Error(errJson.error || `Lỗi máy chủ (${response.status})`);
    }

    const data = await response.json();

    // Render thông báo chính
    let aiHtml = `<p>${data.message}</p>`;

    // Render mảng lỗi sai (chữ đỏ)
    if (
      data.analysis &&
      data.analysis.mistakes &&
      data.analysis.mistakes.length > 0
    ) {
      aiHtml += `<div style="color: #d9534f; border-left: 3px solid #d9534f; padding-left: 10px; margin-top: 10px;">
                <strong>Điểm cần khắc phục:</strong>
                <ul style="margin-top: 5px; padding-left: 20px;">`;
      data.analysis.mistakes.forEach((mistake: string) => {
        aiHtml += `<li>${mistake}</li>`;
      });
      aiHtml += `</ul></div>`;
    }

    // Render kịch bản tốt nhất (code block)
    if (data.analysis && data.analysis.best_scenario) {
      aiHtml += `<div style="margin-top: 10px;">
                <strong>Kịch bản đề xuất:</strong>
                <pre style="background: #e9ecef; padding: 10px; border-radius: 4px; overflow-x: auto; color: #1e1e1e;"><code>${data.analysis.best_scenario}</code></pre>
            </div>`;
    }

    appendMessage("SBE Mentor", aiHtml);

    // Gửi thành công, xóa bản nháp
    localStorage.removeItem("sbe_draft");
    gherkinEditor.value = "";
  } catch (error: any) {
    if (error.message === "OFFLINE") {
      appendMessage(
        "Hệ thống",
        "Bạn đang mất kết nối mạng. Kịch bản đã được lưu nháp an toàn.",
        true,
      );
    } else {
      appendMessage("Hệ thống", "Lỗi xử lý: " + error.message, true);
    }
  } finally {
    btnSend.disabled = false;
    btnSend.textContent = "Gửi Kịch bản";
  }
});

btnRecall.addEventListener("click", async () => {
  const currentWeek = parseInt(weekSelector.value, 10) || 1;
  const selectedModel =
    modelSelector?.value ||
    localStorage.getItem("sbe_selected_model") ||
    "gemini-3.6-flash";

  btnRecall.disabled = true;
  btnRecall.textContent = "Đang tổng kết...";

  appendMessage(
    "Hệ thống",
    `Đang trích xuất dữ liệu từ <em>Memory_Blocks</em> và tiến hành phân tích tiến trình học tập cho Tuần ${currentWeek} (Mô hình: ${selectedModel})...`,
    false,
  );

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentWeek, model: selectedModel }),
    });

    if (!response.ok) {
      if (response.status === 503) throw new Error("OFFLINE");
      const errJson = await response.json().catch(() => ({}));
      if (
        errJson.isLocationBlocked ||
        (errJson.error &&
          (errJson.error.includes("location") ||
            errJson.error.includes("Vị trí máy chủ")))
      ) {
        const locationWarningHtml = `
          <div style="background: #fff3cd; color: #856404; border: 1px solid #ffeeba; padding: 12px; border-radius: 6px;">
            <strong>⚠ Hạn chế Địa lý từ Google Gemini API:</strong>
            <p style="margin: 6px 0;">${errJson.error}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #664d03;">${errJson.detail || "Cloudflare Edge Node đang ở vùng bị Google chặn. Dự án đã kích hoạt cấu hình placement trong wrangler.jsonc."}</p>
          </div>
        `;
        appendMessage("Hệ thống", locationWarningHtml, true);
        return;
      }
      throw new Error(errJson.error || `Lỗi máy chủ (${response.status})`);
    }

    const data = await response.json();

    if (data.empty) {
      appendMessage(
        "SBE Mentor",
        `<p style="color: #666; font-style: italic;">${data.message}</p>`,
      );
      return;
    }

    const recall = data.recall;
    const score = recall.readiness_score ?? 0;
    const scoreColor =
      score >= 80 ? "#28a745" : score >= 50 ? "#ffc107" : "#dc3545";

    let recallHtml = `
      <div style="background: #ffffff; border: 1px solid #dcdcdc; border-radius: 8px; padding: 16px; margin-top: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-bottom: 12px;">
          <h3 style="margin: 0; color: #007acc; font-size: 16px;">📊 BẢNG TỔNG KẾT TIẾN TRÌNH HỌC TẬP (TUẦN ${currentWeek})</h3>
          <span style="background: ${scoreColor}; color: white; padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 13px;">
            Sẵn sàng: ${score}/100
          </span>
        </div>

        <p style="margin: 8px 0; line-height: 1.5; color: #222;">
          <strong>Đánh giá tổng quan:</strong> ${recall.overview}
        </p>
    `;

    if (recall.mastered_concepts && recall.mastered_concepts.length > 0) {
      recallHtml += `
        <div style="margin-top: 12px; border-left: 3px solid #28a745; padding-left: 10px;">
          <strong style="color: #28a745;">✔ Khái niệm đã làm chủ:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 20px; color: #333;">
            ${recall.mastered_concepts.map((c: string) => `<li>${c}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    if (recall.recurring_mistakes && recall.recurring_mistakes.length > 0) {
      recallHtml += `
        <div style="margin-top: 12px; border-left: 3px solid #d9534f; padding-left: 10px;">
          <strong style="color: #d9534f;">⚠ Lỗi sai còn lặp lại cần khắc phục:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 20px; color: #333;">
            ${recall.recurring_mistakes.map((m: string) => `<li>${m}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    if (recall.action_plan && recall.action_plan.length > 0) {
      recallHtml += `
        <div style="margin-top: 12px; border-left: 3px solid #007acc; padding-left: 10px;">
          <strong style="color: #007acc;">💡 Kế hoạch hành động gợi ý:</strong>
          <ul style="margin: 6px 0 0 0; padding-left: 20px; color: #333;">
            ${recall.action_plan.map((a: string) => `<li>${a}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    recallHtml += `
        <div style="margin-top: 12px; font-size: 11px; color: #888; text-align: right;">
          Dữ liệu tổng hợp từ ${data.total_blocks_analyzed} kịch bản trong Memory_Blocks
        </div>
      </div>
    `;

    appendMessage("SBE Mentor", recallHtml);
  } catch (error: any) {
    if (error.message === "OFFLINE") {
      appendMessage(
        "Hệ thống",
        "Bạn đang mất kết nối mạng. Tính năng tổng kết yêu cầu kết nối tới Edge Server.",
        true,
      );
    } else {
      appendMessage("Hệ thống", "Lỗi tổng kết: " + error.message, true);
    }
  } finally {
    btnRecall.disabled = false;
    btnRecall.textContent = "Tổng kết (Recall)";
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(console.error);
  });
}
// ==========================================
// 7. TÍNH NĂNG KÉO THẢ ĐIỀU CHỈNH MÀN HÌNH (BẢN CHUẨN)
// ==========================================
const appContainer = document.getElementById("appContainer") as HTMLDivElement;
const resizer = document.getElementById("dragMe") as HTMLDivElement;
const leftPanel = document.querySelector(".ai-chat-section") as HTMLDivElement;
const rightPanel = document.querySelector(
  ".gherkin-editor-section",
) as HTMLDivElement;

if (appContainer && resizer) {
  let isResizing = false;

  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    // Ngăn textarea nuốt sự kiện chuột khi kéo nhanh
    if (leftPanel) leftPanel.style.pointerEvents = "none";
    if (rightPanel) rightPanel.style.pointerEvents = "none";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;

    let newLeftWidth = (e.clientX / window.innerWidth) * 100;
    if (newLeftWidth < 20) newLeftWidth = 20;
    if (newLeftWidth > 80) newLeftWidth = 80;

    appContainer.style.gridTemplateColumns = `${newLeftWidth}% 5px 1fr`;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";

      // Trả lại khả năng tương tác cho 2 khung
      if (leftPanel) leftPanel.style.pointerEvents = "auto";
      if (rightPanel) rightPanel.style.pointerEvents = "auto";
    }
  });
} else {
  console.warn("Chưa tìm thấy id='appContainer' hoặc 'dragMe' trong HTML.");
}
