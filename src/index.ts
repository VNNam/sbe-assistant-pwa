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
const gherkinHighlighting = document.getElementById(
  "gherkinHighlighting",
) as HTMLPreElement;
const gherkinHighlightingCode = document.getElementById(
  "gherkinHighlightingCode",
) as HTMLElement;
const chatHistory = document.getElementById("chatHistory") as HTMLDivElement;
const weekSelector = document.getElementById(
  "weekSelector",
) as HTMLSelectElement;
const modelSelector = document.getElementById(
  "modelSelector",
) as HTMLSelectElement;
const chatInput = document.getElementById("chatInput") as HTMLInputElement;
const btnSendChat = document.getElementById("btnSendChat") as HTMLButtonElement;

// Làm sạch localStorage nếu còn lưu trữ model cũ đã bị Google khai tử
const currentSavedModel = localStorage.getItem("sbe_selected_model");
if (
  currentSavedModel &&
  (currentSavedModel.includes("gemini-2.0-flash") ||
    currentSavedModel.includes("gemini-2.5-flash"))
) {
  localStorage.removeItem("sbe_selected_model");
}

function getEffectiveModel(): string {
  let model =
    modelSelector?.value ||
    localStorage.getItem("sbe_selected_model") ||
    "gemini-3.6-flash";
  if (
    model.includes("gemini-2.0-flash") ||
    model.includes("gemini-2.5-flash")
  ) {
    model = "gemini-3.6-flash";
    localStorage.setItem("sbe_selected_model", model);
  }
  return model;
}

// Hàm đổi màu các từ khóa Gherkin (Syntax Highlighting)
function highlightGherkin(text: string): string {
  if (!text) return "";

  // 1. Escape HTML chống XSS và giữ định dạng
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Chú thích (# ...)
  escaped = escaped.replace(/(#[^\n]*)/g, '<span class="gh-comment">$1</span>');

  // 3. Chuỗi trong ngoặc kép ("..." hoặc '...')
  escaped = escaped.replace(
    /(".*?"|'.*?')/g,
    '<span class="gh-string">$1</span>',
  );

  // 4. Tags (@tag)
  escaped = escaped.replace(/(@[\w-]+)/g, '<span class="gh-tag">$1</span>');

  // 5. Từ khóa Feature (Feature: hoặc Tính năng:)
  escaped = escaped.replace(
    /\b(Feature|Tính năng):/g,
    '<span class="gh-kwd-feature">$1:</span>',
  );

  // 6. Từ khóa Scenario / Scenario Outline / Kịch bản / Kịch bản mẫu
  escaped = escaped.replace(
    /\b(Scenario Outline|Scenario|Kịch bản mẫu|Kịch bản):/g,
    '<span class="gh-kwd-scenario">$1:</span>',
  );

  // 7. Từ khóa Background / Examples / Bối cảnh / Ví dụ
  escaped = escaped.replace(
    /\b(Background|Examples|Bối cảnh|Ví dụ):/g,
    '<span class="gh-kwd-sub">$1:</span>',
  );

  // 8. Từ khóa các bước (Given, When, Then, And, But, Cho, Khi, Thì, Và, Nhưng)
  escaped = escaped.replace(
    /\b(Given|When|Then|And|But|Cho|Khi|Thì|Và|Nhưng)\b/g,
    '<span class="gh-kwd-step">$1</span>',
  );

  // 9. Dấu Pipe (|) của bảng dữ liệu (Data Table)
  escaped = escaped.replace(/(\|)/g, '<span class="gh-pipe">$1</span>');

  return escaped;
}

function updateEditorHighlight() {
  if (!gherkinHighlightingCode || !gherkinEditor) return;
  let val = gherkinEditor.value;
  // Bổ sung khoảng trắng nếu kết thúc bằng ký tự xuống dòng để pre khớp chiều cao
  if (val[val.length - 1] === "\n") {
    val += " ";
  }
  gherkinHighlightingCode.innerHTML = highlightGherkin(val);
  if (gherkinHighlighting) {
    gherkinHighlighting.scrollTop = gherkinEditor.scrollTop;
    gherkinHighlighting.scrollLeft = gherkinEditor.scrollLeft;
  }
}

// Tự động khôi phục bản nháp từ LocalStorage khi mở lại web
const savedDraft = localStorage.getItem("sbe_draft");
if (savedDraft) {
  gherkinEditor.value = savedDraft;
  updateEditorHighlight();
}

// Cập nhật highlight và lưu nháp khi gõ phím
gherkinEditor.addEventListener("input", () => {
  updateEditorHighlight();
  localStorage.setItem("sbe_draft", gherkinEditor.value);
});

// Đồng bộ cuộn giữa textarea và pre highlight
gherkinEditor.addEventListener("scroll", () => {
  if (gherkinHighlighting) {
    gherkinHighlighting.scrollTop = gherkinEditor.scrollTop;
    gherkinHighlighting.scrollLeft = gherkinEditor.scrollLeft;
  }
});

// Hỗ trợ thụt lề bằng phím Tab (2 spaces) chuẩn IDE
gherkinEditor.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = gherkinEditor.selectionStart;
    const end = gherkinEditor.selectionEnd;
    gherkinEditor.value =
      gherkinEditor.value.substring(0, start) +
      "  " +
      gherkinEditor.value.substring(end);
    gherkinEditor.selectionStart = gherkinEditor.selectionEnd = start + 2;
    updateEditorHighlight();
    localStorage.setItem("sbe_draft", gherkinEditor.value);
  }
});

// Tải danh sách model Gemini khả dụng từ backend
async function loadAvailableModels() {
  if (!modelSelector) return;

  // Kiểm tra xem người dùng có chủ động đổi model trong phiên hiện tại không
  const userManualChoice = sessionStorage.getItem("sbe_user_picked_model");

  try {
    const res = await fetch("/api/models");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models: Array<{ id: string; displayName: string }> =
      data.models || [];
    const latestDefaultModel =
      data.defaultModel || models[0]?.id || "gemini-3.8-flash";

    // Mặc định lấy phiên bản Gemini Flash mới nhất tại thời điểm truy cập
    const activeModel = userManualChoice || latestDefaultModel;

    if (models.length > 0) {
      modelSelector.innerHTML = "";
      models.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.displayName || m.id;
        if (m.id === activeModel) {
          opt.selected = true;
        }
        modelSelector.appendChild(opt);
      });

      // Đảm bảo modelSelector phản ánh đúng activeModel hoặc model mới nhất đầu tiên
      if (!models.some((m) => m.id === activeModel)) {
        modelSelector.value = latestDefaultModel;
        localStorage.setItem("sbe_selected_model", latestDefaultModel);
      } else {
        modelSelector.value = activeModel;
        localStorage.setItem("sbe_selected_model", activeModel);
      }
    }
  } catch (err) {
    console.warn(
      "Không thể tải danh sách model động từ /api/models, dùng model dự phòng:",
      err,
    );
    const fallbackModel = "gemini-3.8-flash";
    modelSelector.value = fallbackModel;
    localStorage.setItem("sbe_selected_model", fallbackModel);
  }
}

if (modelSelector) {
  modelSelector.addEventListener("change", () => {
    sessionStorage.setItem("sbe_user_picked_model", modelSelector.value);
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

/**
 * renderErrorCard — Hiển thị thông báo lỗi thân thiện dạng card lên chat history.
 * KHÔNG hiển thị thông tin kỹ thuật (stack trace, raw JSON) lên giao diện.
 */
function renderErrorCard(
  errData: {
    errorCode?: string;
    error?: string;
    retryAfterSeconds?: number;
    isQuota?: boolean;
    isOffline?: boolean;
  },
  retryCallback?: () => void,
) {
  const code = errData.errorCode || "ERR";
  const message =
    errData.error ||
    "Đã xảy ra lỗi. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.";
  const isQuota = !!errData.isQuota;
  const retryAfter = errData.retryAfterSeconds;

  const cardEl = document.createElement("div");
  cardEl.style.marginBottom = "15px";

  // Xác định màu sắc theo loại lỗi
  const isWarn = isQuota || code.includes("503") || code.includes("429");
  const bg = isWarn ? "#fff8e1" : "#fff3f3";
  const border = isWarn ? "#f0ad4e" : "#d9534f";
  const icon = isWarn ? "⚠" : "✖";
  const titleColor = isWarn ? "#856404" : "#721c24";

  let cardHtml = `
    <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:12px 14px;font-size:13.5px;line-height:1.5;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div>
          <strong style="color:${titleColor};">${icon} Mã lỗi: ${code}</strong>
          <p style="margin:6px 0 0 0;color:#333;">${escapeHtml(message)}</p>
        </div>
      </div>`;

  if (retryCallback && retryAfter !== undefined && retryAfter > 0) {
    cardHtml += `
      <div style="margin-top:10px;">
        <button id="retryBtn_${code}" style="background:#f0ad4e;color:#fff;border:none;border-radius:5px;padding:7px 14px;cursor:pointer;font-size:13px;">
          Thử lại sau <span id="retryCountdown_${code}">${retryAfter}</span>s
        </button>
      </div>`;
  } else if (retryCallback) {
    cardHtml += `
      <div style="margin-top:10px;">
        <button id="retryBtn_${code}" style="background:#007acc;color:#fff;border:none;border-radius:5px;padding:7px 14px;cursor:pointer;font-size:13px;">
          Thử lại
        </button>
      </div>`;
  }

  cardHtml += `</div>`;
  cardEl.innerHTML = `<strong style="color:#d9534f;">Hệ thống:</strong> <div style="margin-top:5px;">${cardHtml}</div>`;
  chatHistory.appendChild(cardEl);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  // Nếu có countdown retry
  if (retryCallback && retryAfter !== undefined && retryAfter > 0) {
    const btnId = `retryBtn_${code}`;
    const countdownId = `retryCountdown_${code}`;
    const btn = cardEl.querySelector<HTMLButtonElement>(`#${btnId}`);
    const countdown = cardEl.querySelector<HTMLSpanElement>(`#${countdownId}`);
    let remaining = retryAfter;

    if (btn) btn.disabled = true;

    const timer = setInterval(() => {
      remaining--;
      if (countdown) countdown.textContent = String(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Thử lại ngay";
          btn.addEventListener("click", () => {
            cardEl.remove();
            retryCallback();
          });
        }
      }
    }, 1000);
  } else if (retryCallback) {
    const btn = cardEl.querySelector<HTMLButtonElement>(`#retryBtn_${code}`);
    if (btn) {
      btn.addEventListener("click", () => {
        cardEl.remove();
        retryCallback();
      });
    }
  }
}

/**
 * renderScenarioAnalysis — Hiển thị kết quả phân tích kịch bản Gherkin theo chuẩn Manning.
 * Gồm: style_score (progress bar), violations (badge theo severity), learned concepts,
 * best_scenario (code block Gherkin chuẩn), recommendations.
 */
function renderScenarioAnalysis(data: any) {
  const analysis = data.analysis || {};
  const score = typeof analysis.style_score === "number" ? analysis.style_score : null;
  const violations: any[] = Array.isArray(analysis.violations) ? analysis.violations : [];
  const learned: string[] = Array.isArray(analysis.learned_concepts) ? analysis.learned_concepts : [];
  const mistakes: string[] = Array.isArray(analysis.mistakes) ? analysis.mistakes : [];
  const recommendations: string[] = Array.isArray(analysis.recommendations) ? analysis.recommendations : [];
  const bestScenario: string = analysis.best_scenario || "";

  // ── Score color
  const scoreColor = score === null ? "#6c757d"
    : score >= 90 ? "#28a745"
    : score >= 70 ? "#007acc"
    : score >= 50 ? "#f0ad4e"
    : "#d9534f";
  const scoreLabel = score === null ? "–"
    : score >= 90 ? "Xuất sắc"
    : score >= 70 ? "Tốt"
    : score >= 50 ? "Cần cải thiện"
    : "Cần viết lại";

  let html = `<div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;margin-top:4px;background:#fff;font-size:13.5px;line-height:1.55;">`;

  // ── Header: tổng quan + score
  html += `
    <div style="background:#f8f9fa;padding:12px 14px;border-bottom:2px solid ${scoreColor};">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <strong style="color:#007acc;font-size:14px;">📋 Phân tích kịch bản — Tiêu chuẩn Manning</strong>
        ${score !== null ? `<span style="background:${scoreColor};color:#fff;padding:3px 10px;border-radius:12px;font-weight:bold;font-size:12px;white-space:nowrap;">
          Style Score: ${score}/100 — ${scoreLabel}
        </span>` : ""}
      </div>
      ${score !== null ? `<div style="margin-top:8px;background:#e9ecef;border-radius:4px;height:6px;overflow:hidden;">
        <div style="width:${score}%;height:100%;background:${scoreColor};border-radius:4px;transition:width 0.4s;"></div>
      </div>` : ""}
      <p style="margin:10px 0 0 0;color:#333;">${escapeHtml(data.message || "")}</p>
    </div>`;

  // ── Violations (major → đỏ, minor → cam)
  const majorViolations = violations.filter(v => v.severity === "major");
  const minorViolations = violations.filter(v => v.severity === "minor");

  if (violations.length > 0) {
    html += `<div style="padding:12px 14px;border-bottom:1px solid #eee;">`;
    html += `<strong style="color:#333;">⚠ Vi phạm tiêu chuẩn (${violations.length})</strong>`;

    const renderViolationGroup = (list: any[], color: string, label: string) => {
      if (list.length === 0) return "";
      let g = `<div style="margin-top:10px;">
        <div style="font-size:12px;color:${color};font-weight:600;margin-bottom:6px;">${label}</div>`;
      list.forEach(v => {
        const code = escapeHtml(v.code || "");
        const step = escapeHtml(v.step || "");
        const explanation = escapeHtml(v.explanation || "");
        const fix = escapeHtml(v.fix || "");
        g += `<div style="margin-bottom:10px;padding:8px 10px;border-left:3px solid ${color};background:${color}14;border-radius:0 4px 4px 0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <span style="background:${color};color:#fff;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;">${code}</span>
            <code style="background:#f4f4f4;padding:2px 6px;border-radius:3px;font-size:12px;color:#c7254e;word-break:break-all;">${step}</code>
          </div>
          <p style="margin:4px 0 0 0;color:#555;font-size:13px;">${explanation}</p>
          ${fix ? `<p style="margin:4px 0 0 0;color:#28a745;font-size:13px;">✔ Sửa thành: <code style="background:#f0fff4;padding:1px 5px;border-radius:3px;">${fix}</code></p>` : ""}
        </div>`;
      });
      g += `</div>`;
      return g;
    };

    html += renderViolationGroup(majorViolations, "#d9534f", "🔴 Vi phạm nghiêm trọng (Major)");
    html += renderViolationGroup(minorViolations, "#f0ad4e", "🟡 Vi phạm nhẹ (Minor)");
    html += `</div>`;
  } else {
    html += `<div style="padding:10px 14px;border-bottom:1px solid #eee;background:#f0fff4;">
      <span style="color:#28a745;font-weight:600;">✔ Không phát hiện vi phạm tiêu chuẩn Manning</span>
    </div>`;
  }

  // ── Learned concepts (xanh lá)
  if (learned.length > 0) {
    html += `<div style="padding:10px 14px;border-bottom:1px solid #eee;border-left:3px solid #28a745;">
      <strong style="color:#28a745;">✔ Khái niệm đã áp dụng đúng:</strong>
      <ul style="margin:6px 0 0 0;padding-left:18px;color:#333;">
        ${learned.map(c => `<li>${escapeHtml(c)}</li>`).join("")}
      </ul>
    </div>`;
  }

  // ── Fallback mistakes (nếu không có violations mà có mistakes)
  if (violations.length === 0 && mistakes.length > 0) {
    html += `<div style="padding:10px 14px;border-bottom:1px solid #eee;border-left:3px solid #d9534f;">
      <strong style="color:#d9534f;">Điểm cần khắc phục:</strong>
      <ul style="margin:6px 0 0 0;padding-left:18px;color:#333;">
        ${mistakes.map(m => `<li>${escapeHtml(m)}</li>`).join("")}
      </ul>
    </div>`;
  }

  // ── Best scenario (Gherkin chuẩn Manning)
  if (bestScenario) {
    html += `<div style="padding:10px 14px;border-bottom:1px solid #eee;">
      <strong style="color:#007acc;">📝 Kịch bản chuẩn Manning (đề xuất):</strong>
      <pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:4px;overflow-x:auto;margin:8px 0 0 0;font-size:12.5px;line-height:1.5;"><code>${escapeHtml(bestScenario)}</code></pre>
    </div>`;
  }

  // ── Recommendations (xanh dương)
  if (recommendations.length > 0) {
    html += `<div style="padding:10px 14px;border-left:3px solid #007acc;">
      <strong style="color:#007acc;">💡 Khuyến nghị:</strong>
      <ul style="margin:6px 0 0 0;padding-left:18px;color:#333;">
        ${recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join("")}
      </ul>
    </div>`;
  }

  html += `</div>`;
  appendMessage("SBE Mentor", html);
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
  const selectedModel = getEffectiveModel();

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
      const errJson = await response.json().catch(() => ({}));
      renderErrorCard(errJson, sendChatMessage);
      return;
    }

    const data = await response.json();

    // Nếu server trả errorCode (lỗi được xử lý có cấu trúc) thì render card lỗi
    if (data.errorCode) {
      renderErrorCard(data, sendChatMessage);
      return;
    }

    const replyHtml = formatMentorMarkdown(
      data.message || "Đã nhận được tin nhắn.",
    );
    appendMessage("SBE Mentor", replyHtml);
  } catch (error: any) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      renderErrorCard({
        errorCode: "ERR-OFFLINE",
        error: "Bạn đang mất kết nối mạng. Tin nhắn chưa được gửi.",
      });
    } else {
      renderErrorCard({
        errorCode: "ERR-CLIENT",
        error:
          "Đã xảy ra lỗi kết nối. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
      });
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

  const selectedModel = getEffectiveModel();

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
      const errJson = await response.json().catch(() => ({}));
      const doRetry = () => btnSend.click();
      renderErrorCard(errJson, doRetry);
      return;
    }

    const data = await response.json();

    // Nếu server trả errorCode (lỗi có cấu trúc) thì render card lỗi
    if (data.errorCode) {
      renderErrorCard(data, () => btnSend.click());
      return;
    }

    // Render kết quả phân tích kịch bản theo chuẩn Manning
    renderScenarioAnalysis(data);


    // Gửi thành công, xóa bản nháp
    localStorage.removeItem("sbe_draft");
    gherkinEditor.value = "";
    updateEditorHighlight();
  } catch (error: any) {
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      renderErrorCard({
        errorCode: "ERR-OFFLINE",
        error: "Bạn đang mất kết nối mạng. Kịch bản đã được lưu nháp an toàn.",
      });
    } else {
      renderErrorCard({
        errorCode: "ERR-CLIENT",
        error:
          "Đã xảy ra lỗi kết nối. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
      });
    }
  } finally {
    btnSend.disabled = false;
    btnSend.textContent = "Gửi Kịch bản";
  }
});

btnRecall.addEventListener("click", async () => {
  const currentWeek = parseInt(weekSelector.value, 10) || 1;
  const selectedModel = getEffectiveModel();

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
      const errJson = await response.json().catch(() => ({}));
      renderErrorCard(errJson, () => btnRecall.click());
      return;
    }

    const data = await response.json();

    // Nếu server trả errorCode (lỗi có cấu trúc)
    if (data.errorCode) {
      renderErrorCard(data, () => btnRecall.click());
      return;
    }

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
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      renderErrorCard({
        errorCode: "ERR-OFFLINE",
        error:
          "Bạn đang mất kết nối mạng. Tính năng tổng kết yêu cầu kết nối tới Edge Server.",
      });
    } else {
      renderErrorCard({
        errorCode: "ERR-CLIENT",
        error:
          "Đã xảy ra lỗi kết nối. Liên hệ với nhà cung cấp dịch vụ để được hỗ trợ.",
      });
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
