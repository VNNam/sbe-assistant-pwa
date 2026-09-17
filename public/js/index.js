"use strict";
// 2. Lấy các phần tử từ DOM
const btnSend = document.getElementById("btnSendScenario");
const btnRecall = document.getElementById("btnRecall");
const gherkinEditor = document.getElementById("gherkinEditor");
const chatHistory = document.getElementById("chatHistory");
// Biến lưu trữ tuần học hiện tại (Tạm thời hardcode là Tuần 1)
let currentWeek = 1;
// 3. Hàm tiện ích: Thêm tin nhắn vào khung chat
function appendMessage(sender, message, isSystem = false) {
    const msgElement = document.createElement("p");
    msgElement.style.color = isSystem ? "#d9534f" : "#333";
    msgElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatHistory.appendChild(msgElement);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Tự động cuộn xuống dòng mới nhất
}
// 4. Xử lý sự kiện "Gửi Kịch bản"
btnSend.addEventListener("click", async () => {
    const text = gherkinEditor.value.trim();
    if (!text) {
        alert("Vui lòng viết kịch bản Gherkin vào ô bên phải trước khi gửi!");
        return;
    }
    // Cập nhật trạng thái UI (Debounce chống spam click)
    btnSend.disabled = true;
    btnSend.textContent = "Đang xử lý...";
    appendMessage("Bạn", "Đã gửi kịch bản để phân tích.");
    // Đóng gói dữ liệu an toàn
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
            throw new Error("Lỗi từ server");
        }
        const data = await response.json();
        // In phản hồi của API ra khung chat
        appendMessage("SBE Mentor", data.message);
        // Khôi phục trạng thái nút bấm
        btnSend.disabled = false;
        btnSend.textContent = "Gửi Kịch bản";
    }
    catch (error) {
        appendMessage("Hệ thống", "Lỗi kết nối đến Cloudflare Functions. Vui lòng thử lại.", true);
        btnSend.disabled = false;
        btnSend.textContent = "Gửi Kịch bản";
    }
});
// 5. Xử lý sự kiện "Tổng kết (Recall)"
btnRecall.addEventListener("click", () => {
    appendMessage("Hệ thống", "Đang trích xuất JSON từ Memory_Blocks để đánh giá tiến độ...", true);
    // TODO: Gọi API /api/analyze
});
