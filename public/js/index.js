"use strict";
const btnSend = document.getElementById("btnSendScenario");
const btnRecall = document.getElementById("btnRecall");
const gherkinEditor = document.getElementById("gherkinEditor");
const chatHistory = document.getElementById("chatHistory");
const weekSelector = document.getElementById("weekSelector");
// Tự động khôi phục bản nháp từ LocalStorage khi mở lại web
const savedDraft = localStorage.getItem("sbe_draft");
if (savedDraft) {
    gherkinEditor.value = savedDraft;
}
// Lưu nháp mỗi khi người dùng gõ phím
gherkinEditor.addEventListener("input", () => {
    localStorage.setItem("sbe_draft", gherkinEditor.value);
});
function appendMessage(sender, htmlContent, isSystem = false) {
    const msgElement = document.createElement("div");
    msgElement.style.color = isSystem ? "#d9534f" : "#333";
    msgElement.style.marginBottom = "15px";
    msgElement.innerHTML = `<strong>${sender}:</strong> <div style="margin-top: 5px;">${htmlContent}</div>`;
    chatHistory.appendChild(msgElement);
    chatHistory.scrollTop = chatHistory.scrollHeight;
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
    appendMessage("Bạn", `<pre style="background: #f4f4f4; padding: 8px; border-radius: 4px;">${text}</pre>`);
    const payload = {
        currentWeek: currentWeek,
        scenarioText: text,
    };
    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            if (response.status === 503)
                throw new Error("OFFLINE");
            throw new Error(`Lỗi máy chủ (${response.status})`);
        }
        const data = await response.json();
        // Render thông báo chính
        let aiHtml = `<p>${data.message}</p>`;
        // Render mảng lỗi sai (chữ đỏ)
        if (data.analysis &&
            data.analysis.mistakes &&
            data.analysis.mistakes.length > 0) {
            aiHtml += `<div style="color: #d9534f; border-left: 3px solid #d9534f; padding-left: 10px; margin-top: 10px;">
                <strong>Điểm cần khắc phục:</strong>
                <ul style="margin-top: 5px; padding-left: 20px;">`;
            data.analysis.mistakes.forEach((mistake) => {
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
    }
    catch (error) {
        if (error.message === "OFFLINE") {
            appendMessage("Hệ thống", "Bạn đang mất kết nối mạng. Kịch bản đã được lưu nháp an toàn.", true);
        }
        else {
            appendMessage("Hệ thống", "Lỗi xử lý: " + error.message, true);
        }
    }
    finally {
        btnSend.disabled = false;
        btnSend.textContent = "Gửi Kịch bản";
    }
});
btnRecall.addEventListener("click", () => {
    appendMessage("Hệ thống", "Đang trích xuất dữ liệu từ Memory_Blocks... (Cần tích hợp Database ở bước sau)", true);
});
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(console.error);
    });
}
// ==========================================
// 7. TÍNH NĂNG KÉO THẢ ĐIỀU CHỈNH MÀN HÌNH (BẢN CHUẨN)
// ==========================================
const appContainer = document.getElementById("appContainer");
const resizer = document.getElementById("dragMe");
const leftPanel = document.querySelector(".ai-chat-section");
const rightPanel = document.querySelector(".gherkin-editor-section");
if (appContainer && resizer) {
    let isResizing = false;
    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        // Ngăn textarea nuốt sự kiện chuột khi kéo nhanh
        if (leftPanel)
            leftPanel.style.pointerEvents = "none";
        if (rightPanel)
            rightPanel.style.pointerEvents = "none";
    });
    document.addEventListener("mousemove", (e) => {
        if (!isResizing)
            return;
        let newLeftWidth = (e.clientX / window.innerWidth) * 100;
        if (newLeftWidth < 20)
            newLeftWidth = 20;
        if (newLeftWidth > 80)
            newLeftWidth = 80;
        appContainer.style.gridTemplateColumns = `${newLeftWidth}% 5px 1fr`;
    });
    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = "default";
            document.body.style.userSelect = "auto";
            // Trả lại khả năng tương tác cho 2 khung
            if (leftPanel)
                leftPanel.style.pointerEvents = "auto";
            if (rightPanel)
                rightPanel.style.pointerEvents = "auto";
        }
    });
}
else {
    console.warn("Chưa tìm thấy id='appContainer' hoặc 'dragMe' trong HTML.");
}
