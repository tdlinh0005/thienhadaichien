# BÁO CÁO TỔNG HỢP REVIEW SOURCE CODE — Thiên Hà Đại Chiến

> **Hội đồng review 6 subagent** · 2026-09-23 · Phiên `2026.09.23-1856-code-review-improvement`
> Quy mô dự án: ~16.800 dòng (js/ 6.9k · server/ 2.8k · web/ 0.8k · tools/ 5.8k) · v1.36.0 · Zero-dependency

## 1. Thành phần hội đồng

| Seat | Phạm vi | Báo cáo |
|---|---|---|
| S1 | Kiến trúc & ranh giới module | [01-architecture.md](01-architecture.md) |
| S2 | Backend & API / Bảo mật | [02-backend-api.md](02-backend-api.md) |
| S3 | Game logic & dữ liệu | [03-game-logic.md](03-game-logic.md) |
| S4 | Frontend & UI | [04-frontend-ui.md](04-frontend-ui.md) |
| S5 | Chất lượng mã & kiểm thử | [05-code-quality.md](05-code-quality.md) |
| S6 | Hiệu năng & độ tin cậy | [06-performance.md](06-performance.md) |

## 2. Đánh giá chung

Dự án có nền tảng **rất tốt**: triết lý zero-dependency triệt để (chỉ dùng node built-ins), **một bộ luật dùng chung client/server** chống trôi lệch logic, Unit-of-Work + transaction SQLite cho PvP đa bên, migration state v3→v7 chặt chẽ, test suite 726 kiểm tra chạy < 4 giây. Các vấn đề tập trung ở **bảo mật endpoint quản trị, đồng bộ luật solo/multiplayer, god-files, I/O đồng bộ chặn event loop** và **thiếu công cụ chất lượng (lint/CI)**.

## 3. Việc cần làm NGAY (P0 — trong 1 ngày)

| # | Việc | Seat | Nơi sửa |
|---|---|---|---|
| 1 | **Khoá endpoint `/api/admin/tocdo`** — hiện mở công khai KHÔNG xác thực, ai cũng đổi được tốc độ server | S2 | `server/api.js` |
| 2 | **Sửa `tools/test-tai.js`** (assert `mau.v === 7` lệch state) và đưa vào `npm test` — test tải đang gãy âm thầm | S5 | `tools/test-tai.js:68`, `package.json` |
| 3 | **Khai báo `playwright` devDependencies** hoặc bắt lỗi thân thiện — `test:ui` crash `ERR_MODULE_NOT_FOUND` | S5 | `package.json` |
| 4 | **`PRAGMA synchronous = NORMAL`** trong `server/db.js` — giảm mạnh I/O fsync mà vẫn an toàn với WAL | S6 | `server/db.js` |
| 5 | **Vá `U.esc`** thêm escape dấu nháy đơn `'` → `&#39;` (phòng XSS qua thuộc tính) | S5/S4 | `js/ui.js:13-16` |
| 6 | **Thêm handler `uncaughtException` / `unhandledRejection`** ghi log thay vì chết process | S6 | `server/index.js` |

## 4. Việc quan trọng (P1 — 1 tuần)

| # | Việc | Seat |
|---|---|---|
| 1 | Sửa **lỗi `chuStack` trong `choMua`** (ngữ cảnh "chủ hiện tại" sai khi tick trong giao dịch chợ) | S2 |
| 2 | **Gom 60 transaction tick thành 1 batch transaction** mỗi nhịp 3s — giảm ~90% thời gian khoá event loop | S6 |
| 3 | Thay **503 khi trùng `dangTick`** bằng hàng đợi theo tài khoản — người chơi không bị lỗi vô cớ | S6 |
| 4 | Chuyển **`scryptSync` → `crypto.scrypt` bất đồng bộ** — chống nghẽn event loop / DoS đăng nhập | S2 |
| 5 | **Đồng bộ công thức cướp đổ bộ solo (67.5%) vs server (85%)** — một luật cho cả hai bản | S3 |
| 6 | **Bổ sung NPC mua hàng cho chợ solo** — hướng dẫn bán Kim Loại trong README hiện vô hiệu | S3 |
| 7 | Tối ưu **thuật toán sửa chữa công sự O(N) → O(1)** khi hàng triệu đơn vị (nguy cơ freeze) | S3 |
| 8 | **Graceful shutdown**: chờ nhịp tick + request in-flight trước khi đóng DB | S2/S6 |
| 9 | **Tách migration khỏi `engine.js`** sang `js/migration.js`; **tách render MP từ `web/js/mp.js` về tầng UI** | S1/S4 |
| 10 | **Nén Gzip + cache header** cho file tĩnh (~450KB → ~120KB); **ESLint + Prettier + CI GitHub Actions** | S6/S5 |
| 11 | Tách `js/ui.js` (2.871 dòng) thành module theo miền; chuẩn hoá a11y (heading, aria-label) | S4 |

## 5. Trung hạn (P2–P3)

- Chuẩn hoá module **ESM thay `eval()`** trong `server/rules.js` (S1/S2/S5 cùng chỉ ra).
- **Tách `server/world.js`** (1.772 dòng, God Object) theo miền: combat / market / alliance / migration.
- **SSE** (`/api/stream`) thay polling 8s cho chat + báo động PvP; conditional polling 304 cho `/api/state`.
- Tách **chat/log khỏi blob state** JSON đế quốc (giảm 60–80% kích thước blob); cập nhật vi sai bảng chỉ mục thay DELETE ALL + INSERT.
- Hoàn thiện **jumpGate** (nội dung rỗng); đổi ID `robot` trùng tên; gom magic numbers vào `data.js`; điều chỉnh rapidfire; sửa khoảng cách đổi hướng hạm đội.
- Dọn **dead code** (`G.capDangXay`, `G.thueDanSuChuKy`, …); đưa `dist/` vào `.gitignore`; đồng bộ `docs/MAY-CHU.md` với API thật; Conventional Commits + commitlint.

## 6. Chủ đề xuyên suốt (đa seat cùng chỉ ra)

1. **`eval()` + biến toàn cục `window.G`** — S1, S2, S5: khó gỡ lỗi, thiếu ranh giới module, rủi ro bảo mật.
2. **God-files** — `ui.js` 2.871 dòng, `world.js` 1.772 dòng, `engine.js` ôm migration: S1, S2, S4, S5.
3. **Phân mảnh solo ↔ multiplayer** (chợ, render, dispatch action, công thức cướp): S1, S3, S4.
4. **I/O đồng bộ chặn event loop** (sqlite sync, scryptSync, JSON blob lớn): S2, S6.
5. **Điểm mạnh chung được cả 6 seat công nhận**: zero-dependency, bộ luật đẳng cấu, UoW/transaction, migration an toàn, test nhanh.

## 7. Lộ trình đề xuất

- **Giai đoạn 1 (1 ngày)** — mục P0 bảng 3: vá bảo mật admin endpoint, sửa test tải, PRAGMA, U.esc, error handlers.
- **Giai đoạn 2 (2–3 ngày)** — P1 phần hiệu năng: batch transaction, hàng đợi thay 503, scrypt async, gzip/cache, shutdown êm.
- **Giai đoạn 3 (1–2 tuần)** — P1 phần cấu trúc: tách migration/ui/world, đồng bộ luật solo-MP, ESLint+CI.
- **Giai đoạn 4 (dài hạn)** — ESM, SSE, tách blob state, dọn dead code, tài liệu.

---
*Báo cáo chi tiết kèm bằng chứng file/dòng: xem 6 file seat ở bảng trên. Hội đồng chạy chế độ audit (chỉ đọc), không thay đổi mã nguồn.*
