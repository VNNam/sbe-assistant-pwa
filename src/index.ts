// 1. Định nghĩa cấu trúc dữ liệu (Interfaces) để đảm bảo chuẩn JSON
interface ScenarioPayload {
  currentWeek: number;
  scenarioText: string;
}

// 2. Lấy các phần tử từ DOM
const btnSend = document.getElementById("btnSendScenario") as HTMLButtonElement;
const btnRecall = document.getElementById("btnRecall") as HTMLButtonElement;
const gherkinEditor = document.getElementById(
  "gherkinEditor",
) as HTMLTextAreaElement;
const chatHistory = document.getElementById("chatHistory") as HTMLDivElement;

// Biến lưu trữ tuần học hiện tại (Tạm thời hardcode là Tuần 1)
let currentWeek = 1;

// 3. Hàm tiện ích: Thêm tin nhắn vào khung chat
function appendMessage(sender: string, message: string, isSystem = false) {
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
  const payload: ScenarioPayload = {
    currentWeek: currentWeek,
    scenarioText: text,
  };

  try {
    // TODO: Ở bước sau, chúng ta sẽ thay phần này bằng fetch() gọi Cloudflare Functions API
    /*
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        */

    // Tạm thời mô phỏng phản hồi từ AI Mentor
    setTimeout(() => {
      appendMessage(
        "SBE Mentor",
        "Hệ thống đã ghi nhận kịch bản của bạn. Chúng ta sẽ kết nối API thực tế ở bước sau nhé!",
      );
      btnSend.disabled = false;
      btnSend.textContent = "Gửi Kịch bản";
    }, 1000);
  } catch (error) {
    appendMessage("Hệ thống", "Lỗi kết nối. Vui lòng thử lại.", true);
    btnSend.disabled = false;
    btnSend.textContent = "Gửi Kịch bản";
  }
});

// 5. Xử lý sự kiện "Tổng kết (Recall)"
btnRecall.addEventListener("click", () => {
  appendMessage(
    "Hệ thống",
    "Đang trích xuất JSON từ Memory_Blocks để đánh giá tiến độ...",
    true,
  );
  // TODO: Gọi API /api/analyze
});
