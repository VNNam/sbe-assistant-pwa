DROP TABLE IF EXISTS Chat_History;
DROP TABLE IF EXISTS Memory_Blocks;

-- Bảng lưu lịch sử chat ngắn hạn
CREATE TABLE Chat_History (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu bộ nhớ JSON dài hạn (RAG)
CREATE TABLE Memory_Blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_id INTEGER NOT NULL,
    summary_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);