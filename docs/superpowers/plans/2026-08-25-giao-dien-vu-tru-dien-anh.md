# Giao diện "Vũ trụ điện ảnh" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng cấp giao diện lên phong cách vũ trụ điện ảnh (panel kính mờ, nền sao đa tầng, font Chakra Petch/Be Vietnam Pro) và tái cấu trúc 3 màn: chip tài nguyên, nav icon, dashboard Tổng Quan.

**Architecture:** Chỉ lớp trình bày — `css/style.css` viết lại giữ nguyên mọi tên class cũ; `js/ui.js` chỉ sửa 3 hàm render thuần (`U.thanhRes`, `U.veMenu`, `U.m_tongquan`) + thêm cột `icon` vào `U.MAN` + helper `U.svgIcon`. Không đụng engine/actions/server/mp logic.

**Tech Stack:** Vanilla CSS (backdrop-filter, CSS custom properties), Google Fonts (Chakra Petch + Be Vietnam Pro), SVG inline không thư viện.

## Global Constraints

- Giữ NGUYÊN mọi tên class hiện có trong css/style.css (485 chỗ gắn class trong ui.js/web/js/mp.js không được vỡ).
- Không framework CSS/JS; nguồn ngoài duy nhất là Google Fonts link trong index.html + web/index.html.
- Offline: font rơi về `"Segoe UI",Tahoma,Arial,sans-serif` — mọi tính năng vẫn chạy.
- Responsive mobile giữ hành vi hiện tại: menu grid, bảng cuộn ngang trong khung riêng, trang không bao giờ cuộn ngang.
- `@media (prefers-reduced-motion: reduce)` tắt toàn bộ animation/transition.
- `npm test` phải xanh sau mỗi Task; bundle build parse OK.

---

### Task 1: Design system — viết lại CSS + fonts

**Files:**
- Modify: `css/style.css` (viết lại hoàn toàn)
- Modify: `index.html` (thêm 3 dòng link fonts trong `<head>`)
- Modify: `web/index.html` (như trên)

**Interfaces:**
- Consumes: mọi class cũ đang dùng trong ui.js/mp.js (liệt kê đầy đủ ở Step 1).
- Produces: token `--den --den2 --panel --panel2 --vien --vien2 --chu --mo --sang --cam --cam2 --lam --luc --do --tim --vang` (giữ tên); class mới `.chip`, `.chip .dot`, `.the-lon`, `.pill-chiso`, `.hanhnhanh`, `.nav-ic`.

- [ ] **Step 1: Liệt kê kho class đang dùng (chống sót)**

Run:
```bash
grep -oE 'class="[^"]*"' js/ui.js web/js/mp.js js/app.js | sed 's/class="//;s/"//' | tr ' ' '\n' | sort -u
```
Ghi danh sách này ra nháp — Task 1 phải style đủ tất cả. Nhóm chính: `khoidong kd-hop kd-logo kd-sub kd-nam kd-form kd-ghi nut lon phu nho oke xoa`, `tt-logo tt-res tt-phu`, `canh bt ok`, `khung panel noi luoi luoi2 bang-cuon the tat cap mt gia ct dk thanh`, `gal-dh tag-lm pl`, `bc kq thang thua hoa nd`, `tn d n moi hu`, `chat-ds chat-dong chat-noi chat-gui chat-ghi`, `hop-thoai ht-trong ht-dau ht-noi`, `toast t loi ok`, `hd-luoi hd-tau hd-td`, `mo sang cam lam luc do vang tim sz r c trong toi nguoi npc-bo dem-nho`.

- [ ] **Step 2: Viết css/style.css mới**

Viết lại hoàn toàn theo design system của spec: token màu kính mờ, nền sao 3 lớp fixed, panel backdrop-blur, typography Chakra Petch/Be Vietnam Pro. Giữ nguyên từng selector cũ với hành vi tương đương hoặc tốt hơn. Thêm block class mới cho Task 2 dùng (`.chip .the-lon .pill-chiso .hanhnhanh .nav-ic`). Bắt buộc có: focus-visible, prefers-reduced-motion, media query 860px giữ mọi quy tắc mobile cũ.

- [ ] **Step 3: Thêm link fonts vào cả hai HTML**

Trong `<head>` trước stylesheet:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet">
```

- [ ] **Step 4: Kiểm chứng**

Run: `node tools/smoke.js && node tools/test-server.js`
Expected: PASS hết (CSS không đụng logic nhưng chạy để chắc).
Run: `node -e "new Function(require('fs').readFileSync('dist/thien-ha-dai-chien.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1])"` sau `npm run build`.
Expected: parse OK.

- [ ] **Step 5: Commit**

```bash
git add css/style.css index.html web/index.html dist/
git commit -m "ui: design system Vũ trụ điện ảnh — kính mờ, nền sao đa tầng, Chakra Petch/Be Vietnam Pro"
```

---

### Task 2: Chip tài nguyên — U.thanhRes

**Files:**
- Modify: `js/ui.js` — hàm `U.thanhRes` (dòng ~98)

**Interfaces:**
- Consumes: `G.RES_HANH_TINH`, `G.byId(G.RES,id)`, `G.sanLuong(st,p)`, `G.dungTich(p)`, `G.soNgan()`, data-live hooks (`res.*`, `rate.*`, `galana`, `tech`) mà `U.live()` cập nhật — PHẢI GIỮ NGUYÊN các thuộc tính `data-live` vì live-update phụ thuộc.
- Produces: markup chip `.chip` với `.dot` màu tài nguyên; `data-live` giữ nguyên vị trí.

- [ ] **Step 1: Viết hàm U.thanhRes mới**

Mỗi loại: chip chứa `<i class="dot" style="background:r.mau"></i><span class="n">ky</span><span class="v sz" data-live="res.id">…</span><span class="r sz" data-live="rate.id">+…</span>`; Galana/Kỹ Thuật/Điện chip riêng (Điện không có rate). Kho đầy → class `day`; thiếu điện → class `thieu-dien` trên chip Điện.

- [ ] **Step 2: Kiểm tra data-live còn nguyên**

Run: `grep -c "data-live" <(node -e "…in ra chuỗi trả về của U.thanhRes với state giả…")` — hoặc đơn giản hơn: mở server thật, xác định số chip = số phần tử `[data-live]` không đổi so với trước.

Run: `npm test` → PASS.

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "ui: chip tài nguyên — chấm màu theo tài nguyên, cảnh báo kho đầy/thiếu điện"
```

---

### Task 3: Nav icon — U.MAN cột icon + U.veMenu

**Files:**
- Modify: `js/ui.js` — mảng `U.MAN` (~dòng 121) và `U.veMenu` (~dòng 142), helper mới `U.svgIcon`

**Interfaces:**
- Consumes: `U.MAN` các id màn hiện có; `data-act="man" data-man=…` mà app.js ACT.man xử lý — GIỮ NGUYÊN cấu trúc anchor.
- Produces: `U.svgIcon(id)` trả chuỗi `<svg viewBox="0 0 24 24">…</svg>` stroke currentColor; mỗi mục MAN có trường `icon`.

- [ ] **Step 1: Định nghĩa U.svgIcon + bổ sung icon vào U.MAN**

16 màn: tongquan(sao), tainguyen(dồng hồ), congtrinh(cần cẩu), nghiencuu(tinh thể), xuong(tàu), phongthu(khiên), hamdoi(hạm), thienha(thiên hà xoắn), lienminh(cờ), taichinh(ngân hàng cột), xephang(cúp), mophong(máy tính trận), tinnhan(thư), huongdan(sách), nhatky(bút), bangtin(loa), chat(bong bóng). Mỗi icon ≤4 path/circle đơn giản, `fill="none" stroke="currentColor" stroke-width="1.7"`.

- [ ] **Step 2: Sửa U.veMenu chèn icon**

`h += '<svg class="nav-ic">' + U.svgIcon(m.icon) …` — giữ `dem-nho` badge bên phải, giữ class `on` logic.

- [ ] **Step 3: Kiểm chứng + commit**

Run: `npm test` → PASS. Commit: `git commit -m "ui: nav icon SVG inline cho menu trái"`.

---

### Task 4: Dashboard Tổng Quan — U.m_tongquan

**Files:**
- Modify: `js/ui.js` — hàm `U.m_tongquan` (~dòng 204)

**Interfaces:**
- Consumes: y nguyên dữ liệu cũ `G.diem/G.bt/G.ds/G.sucChuaDan/G.oDaDung/G.oToiDa/G.khe/G.kheThamHiem/G.maxThuocDia/G.loaiHT/G.so/G.so/U.dem/U.bp/U.dsTau`; action cũ `doi-ten bo-hoang doithue man`.
- Produces: markup dashboard dùng class `.the-lon` (số liệu lớn) + `.pill-chiso` (pill có bar) + `.hanhnhanh` (4 nút điều hướng).

- [ ] **Step 1: Viết lại thân hàm**

Hàng 1: 3 thẻ lớn — Điểm (+ dòng phụ CT·NC·Hạm·Thủ), Bảo trì (countdown `U.dem(bt.nextAt)` glow cam, chu kỳ #), Dân số (population/sucChua + bar; ủng hộ bar `supportBp/20000`).
Hàng 2 pills: ô đất (bar oDaDung/oToiDa), khe hạm đội (+thám hiểm), số hành tinh, nhiệt độ, loại hành tinh (màu Lp.mau), thuế (input #thue-pct giữ nguyên id + nút doithue), thực phẩm chu kỳ.
Hàng 3: `.hanhnhanh` 4 nút `data-act="man"` tới congtrinh/nghiencuu/xuong/thienha.
Phần dưới: giữ các panel cũ (trận đánh stats, quân đổ bộ giữ nhà, đổi tên/bỏ hoang chuyển xuống panel "Quản lý").

- [ ] **Step 2: Kiểm chứng**

Run: `npm test && npm run build` → PASS + bundle parse OK. Mở `/motnguoi` thủ công kiểm tra input thuế còn hoạt động (id #thue-pct không đổi).

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "ui: Tổng Quan thành dashboard — thẻ số liệu lớn, pill tiến độ, hàng hành động nhanh"
```

---

### Task 5: Build, review độc lập, fix, docs

**Files:**
- Modify: bất kỳ file nào reviewer chỉ ra lỗi
- Modify: `docs/MAY-CHU.md` (mục UI nếu có nhắc), báo cáo `docs/superpowers/BAO-CAO-V7.md` hoặc tạo `docs/superpowers/BAO-CAO-UI.md`

- [ ] **Step 1: npm test + npm run build xanh**
- [ ] **Step 2: Dispatch code-reviewer agent** — phạm vi: css/style.css, ui.js (3 hàm), 2 file HTML; tiêu chí: class nào bị bỏ sót, responsive vỡ không, contrast đạt chưa, data-live còn nguyên, không đụng nhầm logic.
- [ ] **Step 3: Fix mọi finding CRITICAL/HIGH; MEDIUM/LOW cân nhắc hợp lý**
- [ ] **Step 4: Chụp màn hình các màn chính qua server thật (nếu Playwright có) lưu `docs/superpowers/ui-screens/`**
- [ ] **Step 5: Viết báo cáo + commit cuối**

```bash
git add -A && git commit -m "ui: hoàn thiện redesign Vũ trụ điện ảnh sau review"
```

---

## Self-review notes

- Spec coverage: design system → T1; chip → T2; nav icon → T3; dashboard → T4; build/review/docs → T5. Fonts offline fallback nằm trong T1 constraints. Không mục spec nào thiếu task.
- Placeholder scan: không có TBD; mỗi task có mô tả nội dung cụ thể (icon list, cấu trúc dashboard, danh sách class).
- Type consistency: tên class mới thống nhất `.chip/.the-lon/.pill-chiso/.hanhnhanh/.nav-ic` xuyên suốt; helper `U.svgIcon(id)` một chữ ký duy nhất.
