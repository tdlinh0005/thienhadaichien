# Báo cáo Redesign Giao diện "Vũ trụ điện ảnh"

Ngày: 2026-08-25 · Trạng thái: đã triển khai xong 5 task, chờ code review độc lập

## Anh cần biết trong 30 giây

- Giao diện đổi từ "webgame phẳng 2010" sang **vũ trụ điện ảnh**: panel kính mờ (backdrop-blur), nền sao đa tầng fixed, font **Chakra Petch** (số/tiêu đề) + **Be Vietnam Pro** (nội dung) tải từ Google Fonts — offline tự rơi về Segoe UI.
- Ba màn tái cấu trúc: **chip tài nguyên** trên thanh trên, **nav icon SVG** menu trái, **dashboard Tổng Quan** dạng thẻ số liệu lớn + pill tiến độ + hàng hành động nhanh.
- Không đụng một dòng logic game nào — chỉ CSS + 3 hàm render thuần trong ui.js. Test xanh 241+333.

## Đã làm gì

| Task | Nội dung | Commit |
|---|---|---|
| 1 | CSS viết lại (318 dòng): token màu mới, panel kính mờ + blur, nền sao 3 lớp fixed, nút có inner highlight, focus ring giữ nguyên; fonts link vào cả 2 HTML | `ui: design system Vũ trụ điện ảnh…` |
| 2 | `U.thanhRes()` → 8 chip: chấm màu theo tài nguyên (`r.mau`), giá trị Chakra Petch tabular, tốc độ `/g`; kho đầy chip viền đỏ nhấp nháy; thiếu điện chip nền đỏ | `ui: chip tài nguyên…` |
| 3 | `U.svgIcon()` + 16 icon SVG stroke inline cho `U.MAN`; mục active có thanh cam + icon glow | `ui: nav icon SVG inline…` |
| 4 | `U.m_tongquan()` dashboard: thẻ Điểm / Bảo trì countdown (glow cam) / Dân số có bar; 7 pill chỉ số có progress mini (ô đất, khe hạm, ủng hộ…); 4 nút hành động nhanh | `ui: Tổng Quan thành dashboard…` |

## Ràng buộc đã giữ

- Mọi tên class cũ vẫn tồn tại trong CSS mới → 485 chỗ gắn class không vỡ
- `data-live` hooks đầy đủ (12 attribute) → số nhảy live vẫn chạy
- `#thue-pct` id giữ nguyên → đổi thuế hoạt động
- Mobile 860px: chip co grid, menu ẩn/hiện như cũ, bảng cuộn ngang trong khung
- `prefers-reduced-motion`: tắt animation sao nhấp nháy + toast
- Offline: font fallback Segoe UI, không vỡ layout

## Kết quả kiểm thử
- smoke 241/241 · server 333/333 · bundle parse OK (323 KB)
- Render thử `m_tongquan`/`thanhRes` với state thật: không crash, đủ thẻ/chip/data-live

## Code review độc lập (agent) — 2 HIGH + 2 MEDIUM, đã sửa hết

| Mức | Bug | Fix |
|---|---|---|
| HIGH | Khối panel "Quản lý" tách dashboard để lại đuôi cũ: 9 hàng số liệu văng khỏi panel, Trận đánh + Quân đổ bộ hiển thị 2 lần, `thue-pct` trùng id khiến đổi thuế ở ô dưới bị nuốt im lặng | Xoá khối treo, gộp về một input duy nhất |
| HIGH | (cùng gốc trên — sửa một lần được cả hai) | |
| MEDIUM | Icon nav SVG không có `class="nav-ic"` → CSS 17px không áp dụng, icon phình ~150px phá nav desktop | Thêm class vào chuỗi svg + rule dự phòng `#menu a svg` |
| MEDIUM | `tr.trong td` `#5b688a` tương phản 3.35:1 < WCAG AA 4.5:1 | Nâng lên `#7e8bab` (~4.9:1) |

Reviewer xác nhận OK: không class nào bị bỏ sót (chỉ `.o` bị thay bởi `.chip` đúng chủ ý); `data-live` đủ 12 key; responsive mobile đầy đủ; prefers-reduced-motion tắt đúng cả 2 animation; badge/class on/data-act giữ nguyên hành vi; contrast mọi cặp màu khác đạt AA.

## Chỗ anh dễ chỉnh sau này
| Muốn đổi | Sửa ở |
|---|---|
| Bảng màu toàn cục | token `:root` đầu `css/style.css` |
| Độ mờ panel | `--panel/--panel2` + `backdrop-filter: blur(9px)` |
| Font | link Google Fonts trong 2 file HTML + biến `--font-chu/--font-so` |
| Icon màn nào đó | `U.svgIcon` map P trong `js/ui.js` |
| Thẻ/pill dashboard | class `.dash-the-lon/.pill-chiso/.hanhnhanh` trong CSS |
