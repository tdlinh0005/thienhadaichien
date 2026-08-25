# Thiết kế: Giao diện "Vũ trụ điện ảnh" cho Thiên Hà Đại Chiến

Ngày: 2026-08-25 · Trạng thái: đã duyệt qua phỏng vấn · Phạm vi: CSS + 3 màn UI, không đụng logic game

## Mục tiêu

Nâng cấp giao diện từ theme "webgame 2010 phẳng" hiện tại thành phong cách **vũ trụ điện
ảnh**: panel kính mờ, nền sao đa tầng, typography sci-fi hỗ trợ tiếng Việt, dashboard Tổng
Quan dạng thẻ số liệu. Giữ nguyên mọi logic game — chỉ đổi lớp trình bày.

## Quyết định đã chốt với người chơi

| Quyết định | Lựa chọn |
|---|---|
| Hướng thẩm mỹ | Vũ trụ điện ảnh (glassmorphism nhẹ + glow) — KHÔNG tái tạo 3D Blue |
| Phạm vi | CSS viết lại + tái cấu trúc 3 màn; không đụng engine/actions/server/mp |
| Màn tái cấu trúc | Tổng Quan (dashboard), chip tài nguyên (thanh trên), nav icon (menu trái) |
| Typography | Google Fonts: Chakra Petch (tiêu đề/số) + Be Vietnam Pro (nội dung); fallback Segoe UI khi offline |

## Design system

### Bảng màu (token CSS, giữ tên biến cũ đang dùng)

```css
--den:#04060d; --den2:#0a101f;
--panel:rgba(16,24,42,.72); --panel2:rgba(12,17,32,.78);   /* kính mờ */
--vien:#263a5e; --vien2:#3b5480;
--chu:#d6e2f5; --mo:#8291ad; --sang:#eef4ff;
--cam:#ffa032; --cam2:#ff7a18; --lam:#57c8ff; --luc:#5fdc8b;
--do:#ff5f5f; --tim:#c78cff; --vang:#ffd75e;
```

Màu tài nguyên lấy từ `G.RES[].mau` như cũ — chip hiển thị đúng màu data.js.

### Typography

- Chakra Petch 600/700: logo, tiêu đề panel, số liệu lớn, nút chính
- Be Vietnam Pro 400/500/600: nội dung bảng, mô tả
- `<link>` Google Fonts trong cả `index.html` và `web/index.html`; offline tự rơi về `"Segoe UI",Tahoma,Arial`
- Số liệu giữ `font-variant-numeric: tabular-nums`

### Chất điện ảnh

- Nền body: 3 lớp sao (`radial-gradient` lặp) + 2 tinh vân mờ góc; `background-attachment: fixed`
- Panel: `backdrop-filter: blur(8px)` trên nền bán trong suốt, viền 1px, bóng sâu `0 18px 50px rgba(0,0,0,.55)`; tiêu đề có thanh accent cam 3px bên trái
- Glow rất hạn chế: chỉ countdown bảo trì và điểm ở dashboard
- Hover bảng: nền sáng + thanh accent trái
- `@media (prefers-reduced-motion)` vẫn tắt toàn bộ animation

## Ba màn tái cấu trúc

### 1. Chip tài nguyên — `U.thanhRes()` trong js/ui.js

Mỗi tài nguyên một chip: chấm màu tròn (`r.mau`) + ký hiệu (`r.ky`) + giá trị Chakra Petch +
tốc độ `/g`. Trạng thái: kho đầy → viền đỏ; thiếu điện → chip Điện nền đỏ nhạt. Kỹ Thuật/Galana/
Điện giữ chip tương tự. Mobile: grid 4 cột như hành vi responsive cũ.

### 2. Nav icon — `U.veMenu()` + cột mới trong `U.MAN`

Thêm trường `icon` vào từng mục `U.MAN`: chuỗi SVG inline 18×18 stroke đơn giản (sao=thông
quan, đồng hồ=tài nguyên, cần cẩu=công trình, tinh thể=nghiên cứu, tàu=xưởng, khiên=phòng thủ,
hạm=hamdoi, thiên hà=thienha, cờ=lienminh, ngân hàng=taichinh, cúp=xephang, máy=mophong,
thư=tinnhan, sách=huongdan…). Không emoji, không thư viện ngoài. Mục active: thanh cam trái +
nền sáng + icon màu cam. Mobile: grid icon-only 5 cột.

### 3. Dashboard Tổng Quan — `U.m_tongquan()`

Cấu trúc mới:
- Hàng thẻ lớn: Điểm (+ phân tích CT·NC·Hạm·Thủ), Bảo trì countdown (glow cam, chu kỳ #),
  Dân số với progress bar + ủng hộ bar
- Hàng pill chỉ số: ô đất (bar), khe hạm đội, số hành tinh, nhiệt độ, loại hành tinh (màu),
  thuế (giữ input đổi thuế), thực phẩm chu kỳ
- Dải hành động nhanh: 4 nút điều hướng (Công Trình · Nghiên Cứu · Xưởng · Thiên Hà)
- Các panel cũ phía dưới (trận đánh, quân giữ nhà…) giữ dữ liệu, hưởng panel kính mới

Dữ liệu lấy y nguyên từ các hàm `G.*` hiện có — không thêm API/logic mới.

## Files bị chạm

| File | Thay đổi |
|---|---|
| `css/style.css` | Viết lại hoàn toàn (~500 dòng). GIỮ NGUYÊN mọi tên class cũ — 485 chỗ gắn class trong ui.js không vỡ. Thêm class mới: `.chip`, `.the-lon`, `.pill-chiso`, `.nav-icon`, `.hanhnhanh` |
| `index.html`, `web/index.html` | Thêm `<link rel="preconnect">` + stylesheet Google Fonts. Không đổi cấu trúc DOM khung |
| `js/ui.js` | Chỉ `U.thanhRes()`, `U.veMenu()`, `U.m_tongquan()` + cột `icon` trong `U.MAN` + helper `U.svgIcon(id)` trả chuỗi SVG inline |
| `web/js/mp.js` | Không đụng |
| `server/*`, `js/engine.js`, `js/actions.js`, `js/fleet.js` | Không đụng |

## Ràng buộc

- Không framework CSS/JS; nguồn ngoài duy nhất là Google Fonts (CSP artifact cho phép)
- Offline: font fallback Segoe UI, mọi thứ khác hoạt động bình thường
- Responsive: giữ nguyên hành vi mobile hiện có (menu grid, chip co lại, bảng cuộn ngang trong khung riêng)
- Bundle artifact build phải parse OK

## Kiểm thử

- `npm test` xanh (smoke + server) — bảo vệ không sửa nhầm logic
- `node tools/build.js && node tools/build.js --artifact` parse OK
- `tools/test-mp-ui.mjs` nếu Playwright có sẵn (không bắt buộc)
- Chụp màn hình từng màn chính qua server thật để người chơi duyệt trực quan trước khi commit cuối

## Tách commit

1. `ui: design system vũ trụ điện ảnh — CSS viết lại, font Chakra Petch/Be Vietnam Pro`
2. `ui: chip tài nguyên, nav icon, dashboard Tổng Quan`
3. `docs+build: cập nhật sau redesign`

## Không thuộc phạm vi

Thẻ bản đồ Thiên Hà trực quan (để đợt sau) · dark/light toggle (game vốn dark-first) ·
đổi cấu trúc màn khác ngoài 3 màn liệt kê · i18n.
