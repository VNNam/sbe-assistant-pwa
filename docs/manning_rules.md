# Tiêu chuẩn Đánh giá Gherkin theo Sách "Writing Great Specifications"

Dựa trên quá trình phân tích kỹ lưỡng cuốn sách *Writing Great Specifications: Using Specification by Example and Gherkin* (Kamil Nicieja, Manning Publications), dưới đây là bộ quy chuẩn (Rubric) chính thức được sử dụng để Agent đánh giá các kịch bản Gherkin của người dùng.

## 1. Nhóm Tiêu chí Cơ bản (Tuần 1-2: Nền tảng Given-When-Then)

*   **[G1] Passive Givens (Chương 3):** `Given` chỉ được sử dụng để mô tả ngữ cảnh hoặc trạng thái của hệ thống *trước* khi hành động xảy ra. Nên sử dụng thể bị động (passive voice) hoặc thì quá khứ hoàn thành. **Tuyệt đối không chứa hành động của người dùng trong `Given`**.
*   **[W1] Single User Task (Chương 3):** `When` là hành động kích hoạt. Mỗi kịch bản (Scenario) chỉ nên có **MỘT** bước `When` duy nhất đại diện cho một nhiệm vụ cấp cao của người dùng (User Task). Không dùng `And` để nối nhiều hành động trong `When`.
*   **[T1] Business Outcomes (Chương 3):** `Then` mô tả hậu quả/kết quả. Kết quả này phải đo lường/quan sát được ở góc độ nghiệp vụ. Cú pháp khuyến nghị: `<actor> should be able to <achieve a result>`.
*   **[A1] Real Actors / Personas (Chương 3):** Để thúc đẩy phát triển từ ngoài vào trong (Outside-in development), `Actor` nên là tên một người dùng cụ thể (VD: "Simona", "Mike") hoặc một Persona thay vì dùng các từ chung chung như "user" hay "admin".

## 2. Nhóm Tiêu chí Nâng cao (Tuần 3-4: Anti-patterns & Scenario Outlines)

*   **[D1] Declarative Style (Chương 3 & 7):** Kịch bản phải được viết theo phong cách Declarative (khai báo), tập trung vào "WHAT" (mục đích nghiệp vụ là gì). **Nghiêm cấm phong cách Imperative (mệnh lệnh)** mô tả "HOW" (thao tác giao diện chi tiết như: "clicks the Submit button", "fills the text field"). Lỗi vi phạm này gọi là *UI-Centered Scenarios*.
*   **[U1] Ubiquitous Language (Chương 1 & 7):** Kịch bản phải sử dụng "Ngôn ngữ chung" (Ubiquitous Language) của miền nghiệp vụ. Loại bỏ hoàn toàn các chi tiết kỹ thuật không cần thiết (*Incidental Details* anti-pattern) như: database, API, ID số, boolean, màu sắc nút bấm.
*   **[E1] Illustrative, not Exhaustive (Chương 5):** Khi sử dụng `Scenario Outline`, bảng `Examples` chỉ nên chứa các ví dụ mang tính minh họa (Illustrative examples) gồm các trường hợp tiêu biểu: Happy path, Angry path, Edge cases. Gherkin **không** dùng để test vét cạn (Exhaustive testing) hay kiểm tra dữ liệu thuần túy (VD: validate định dạng email, kiểm tra số ký tự của mật khẩu).
*   **[E2] The Goldilocks Principle (Chương 5):** Khi kiểm tra các điều kiện biên (Classes of Equivalence), áp dụng nguyên tắc Goldilocks: Cung cấp ít nhất 3 ví dụ: 1 giá trị dưới biên (quá nhỏ/quá ít), 1 giá trị tại biên (vừa đủ), và 1 giá trị qua biên (quá lớn/quá nhiều).
*   **[S1] No SQL-like Tables (Chương 5):** Các bước `Given` có bảng dữ liệu (Data tables) hoặc bảng `Examples` không được thiết kế giống như bảng trong cơ sở dữ liệu quan hệ (tránh dùng các cột như `id`, `foreign_key`, `user_id`).

## 3. Quản lý Specification Suite (Mở rộng)

*   **[O1] Features vs. Abilities (Chương 8):** Phân chia các kịch bản theo `Ability` (Khả năng của một bên liên quan) thay vì `Feature` chung chung.
*   **[O2] Business Needs (Chương 8):** Sử dụng từ khóa `Business Need` để định nghĩa các yêu cầu phi chức năng (Non-functional requirements) như Bảo mật, Hiệu suất, thay vì cố gắng nhồi nhét chúng vào các tính năng chức năng.

---
*Bộ tiêu chuẩn này sẽ được mã hóa vào System Prompt của SBE Mentor Agent nhằm đảm bảo phản hồi phân tích sát với lý thuyết chuyên sâu của tài liệu.*
