# Báo cáo Review Frontend & UI — Thiên Hà Đại Chiến (Seat S4)

> **Dự án**: Thiên Hà Đại Chiến (Vanilla JavaScript, DOM thuần, không framework)  
> **Phạm vi kiểm tra**: `js/ui.js`, `css/style.css`, `css/tokens.css`, `index.html`, `web/index.html`, `web/js/mp.js`, `js/app.js`, `design.md`  
> **Người thực hiện**: Reviewer Frontend & UI (Seat S4)  
> **Thời điểm thực hiện**: 2026-09-23  

---

## 1. Tóm tắt

Giao diện người dùng của **Thiên Hà Đại Chiến** là một sản phẩm phục dựng xuất sắc trên nền tảng **Vanilla JS và DOM thuần**, hoàn toàn không phụ thuộc vào bất kỳ framework (React, Vue) hay thư viện ngoài nào. Hệ thống bám sát triết lý thiết kế **"Trung tâm Chỉ huy (Command Workbench)"** được quy chuẩn hóa trong `design.md`: dải tình hình chiến dịch (Situation Strip) trả lời 4 câu hỏi thực tế, cấu trúc 5 nhóm không gian làm việc (Workspace Rail), bảng màu tối chuẩn xác sử dụng không gian màu `oklch`, typography kết hợp Chakra Petch và Be Vietnam Pro, cùng khả năng co giãn tốt trên thiết bị di động với thanh điều hướng đáy.

Tuy nhiên, dưới góc độ kỹ thuật frontend và kiến trúc UI dài hạn, hệ thống đang đối mặt với những vấn đề nghiêm trọng:
1. **File nguyên khối "God File"**: `js/ui.js` gánh vác 2.871 dòng (184 KB) chứa từ primitive runtime, tiện ích modal, thuật toán view-model, shell điều hướng cho đến toàn bộ 15 màn hình nghiệp vụ.
2. **Xung đột mô hình Render**: Sử dụng cơ chế thay thế chuỗi HTML toàn phần (`root.innerHTML = f()`) kết hợp với bộ máy "vá víu" lưu/khôi phục focus và con trỏ phức tạp (hơn 140 dòng code), gây xung đột với luồng cập nhật vi mô (`U.live()`) và luồng đồng bộ định kỳ của chế độ nhiều người chơi.
3. **Phân mảnh giao diện giữa Solo và Multiplayer**: File `web/js/mp.js` can thiệp thô bạo vào UI thông qua kỹ thuật monkey-patching ghi đè các hàm render của `ui.js`, tự sinh HTML cho 4 màn hình riêng và ghi đè hành động của `app.js`.
4. **Vi phạm chuẩn Accessibility & Quy chuẩn CSS**: Tồn tại hiện tượng nhảy cóc cấp độ tiêu đề (`h2` nhảy sang `h4`), nhãn ngữ cảnh ô nhập liệu chưa đầy đủ, nhiều khối luật CSS trùng lặp 100%, lạm dụng inline styles và thiếu hoàn toàn các breakpoint cho màn hình lớn (1280px / 1440px) đã được cam kết trong `design.md`.

---

## 2. Điểm mạnh

1. **Zero-Framework & Tối ưu tải trang ban đầu (Performance First)**:
   - Toàn bộ ứng dụng chạy trên HTML, CSS và JavaScript thuần tiêu chuẩn trình duyệt, kích thước file nhỏ gọn, không tốn chi phí bundle, không chi phí ảo hóa DOM (Virtual DOM overhead), thời gian khởi động gần như tức thì.
2. **Triển khai chuẩn xác Design System `oklch` và Typography**:
   - `css/tokens.css` triển khai đầy đủ hệ thống màu sắc không gian `oklch` theo `design.md`, phân tách rõ rệt màu nền chiều sâu (`--color-paper`), màu chữ (`--color-ink`), accent hổ phách (`--color-accent`) và các màu trạng thái có ngữ nghĩa (`--color-info`, `--color-success`, `--color-warning`, `--color-danger`).
   - Tuyệt đối không dùng mã màu hex/rgb hardcode rải rác trong `css/style.css` (100% sử dụng CSS variables và `color-mix`).
   - Tuân thủ triệt để các lệnh cấm của `design.md`: loại bỏ glassmorphism trên panel thông thường, không dùng glow chữ trang trí, không dùng hiệu ứng nền sao chuyển động vô tận.
3. **Hiện thực hóa trung thực Signature "Dải tình hình chiến dịch"**:
   - Khối Situation Strip (`U.tinhHinhBar` trong `js/ui.js:982-1008`) thể hiện trọn vẹn 4 yếu tố cốt lõi: Phạm vi (Scope: Toàn đế quốc hay toạ độ hành tinh), Cảnh báo ưu tiên kèm hậu quả và nút CTA trực tiếp, Tình hình đang chạy (hàng đợi xây, xưởng, hạm đội), Năng lực tài nguyên tóm tắt.
4. **Cơ chế cập nhật thời gian thực nhẹ nhàng (`U.live`)**:
   - `U.live()` (`js/ui.js:2658-2690`) tận dụng thuộc tính `data-live` và class `.dem` để cập nhật trực tiếp `textContent` của các số liệu tài nguyên và đồng hồ đếm ngược mỗi 1 giây mà không kích hoạt vẽ lại toàn màn hình, tiết kiệm tối đa CPU/pin.
5. **Khai thác hiệu quả Event Delegation trên `document`**:
   - `js/app.js:401-407` áp dụng ủy quyền sự kiện (Event Delegation) thông qua thuộc tính `[data-act]`, giúp việc gán hành động độc lập hoàn toàn với vòng đời tạo/hủy phần tử DOM khi re-render chuỗi HTML.
6. **Kiểm soát khả năng truy cập (A11y) tốt ở tầng Shell và Hộp thoại**:
   - Hộp thoại modal (`U.hop` trong `js/ui.js:41-69`) hỗ trợ bẫy tiêu điểm (focus trap) 2 chiều (Tab / Shift+Tab), phím tắt `Escape`, và khôi phục tiêu điểm (`_hopTrigger`) về nút gốc khi đóng.
   - Trạng thái điều hướng thể hiện rõ qua `aria-current="page"` và `aria-current="true"`.
   - Có tích hợp vùng thông báo ẩn ARIA Live Regions (`#tinh-hinh-khan` assertive và `#tinh-hinh-thuong` polite trong `index.html:52-53` & `js/ui.js:933-957`).
7. **Đáp ứng Mobile tốt ở các thành phần cốt lõi**:
   - Navigation tự động chuyển thành thanh điều hướng đáy 5 nút ở mobile (<640px) và menu sheet kéo lên.
   - Ma trận hành tinh Tổng quan tự động chuyển từ bảng ngang sang danh sách mở rộng dạng thẻ accordion `<details>/<summary>` (`.tq-ma-tran-mobile` trong `css/style.css:366-384, 546`).
   - Nút bấm đảm bảo diện tích chạm tối thiểu 44px trên màn hình cảm ứng (`min-height: var(--size-control)` trong `css/style.css:85`).

---

## 3. Vấn đề phát hiện (Kèm bằng chứng file / dòng)

### 3.1. Phân rã Module & Khớp nối Kiến trúc

- **[VĐ-01] "God File" `js/ui.js` gánh vác quá nhiều tầng trách nhiệm vi phạm SRP**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/js/ui.js#L1-L2871`
  - **Bằng chứng**: Toàn bộ file dài 2.871 dòng (184 KB) được cấu trúc dồn cục trong một scope duy nhất gắn vào biến toàn cục `window.U = {}`:
    + *Dòng 1-70*: Khởi tạo state runtime, bộ lọc an toàn XSS (`U.esc`), quản lý hành tinh chọn (`U.datPi`), subsystem thông báo Toast (`U.toast`) và Hộp thoại Modal (`U.hop`, `U.dongHop`).
    + *Dòng 71-575*: Thuật toán chuyển đổi dữ liệu và mô hình cảnh báo (Alert Model, Signature state `U.sig`, định danh hàng đợi `U.khoaHangDoi`).
    + *Dòng 576-1031*: Shell ứng dụng, từ điển icon SVG inline, thanh tài nguyên, thanh tình hình, thực đơn chuyển nhanh (Command Palette).
    + *Dòng 1032-2386*: Toàn bộ logic render HTML của 14 màn hình solo.
    + *Dòng 2387-2691*: Vòng lặp render `U.ve`, bộ phát hiện live `U.live`, cơ chế khôi phục focus/selection.
    + *Dòng 2692-2871*: Logic và giao diện của Máy tính trận đánh (`U.m_mophong`).
  - **Hệ quả**: Khó bảo trì, xung đột code khi nhiều người cùng làm việc, không thể áp dụng kiểm thử đơn vị độc lập cho từng màn hình hoặc từng thành phần view-model.

- **[VĐ-02] Phân mảnh giao diện và Monkey-Patching thô bạo trong `web/js/mp.js`**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L201-L202`
    + `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L203-L344`
    + `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L349-L350`
    + `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L481-L520`
  - **Bằng chứng**:
    ```javascript
    // web/js/mp.js:201
    U.MAN = U.taoMAN('mp');

    // web/js/mp.js:349-350
    var lmGoc = U.m_lienminh;
    U.m_lienminh = function () {
      var st = U.st();
      var h = lmGoc();
      // ... tự nối thêm hàng chục thẻ HTML cho MP ...
    };
    ```
    Bên cạnh đó, `web/js/mp.js` tự khai báo 3 hàm màn hình mới (`U.m_bangtin`, `U.m_chat`, `U.m_taikhoan`), và dùng `APP.themACT` để ghi đè các hành động thị trường (`dang-ban`, `mua-don`, `huy-don`, `tab-tc`).
  - **Hệ quả**: Phá vỡ tính toàn vẹn của registry điều hướng tập trung. Khi lập trình viên thay đổi template ở `ui.js`, phần giao diện mở rộng trong `mp.js` dễ bị lệch cấu trúc hoặc sinh lỗi runtime. Việc debug luồng render trở nên phức tạp vì code giao diện nằm rải rác ở hai thư mục khác nhau.

---

### 3.2. Pattern Render & Quản lý State

- **[VĐ-03] Re-render toàn phần bằng chuỗi HTML (`innerHTML = f()`) và bộ máy bù trừ rủi ro**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/js/ui.js#L2541-L2564`
  ```javascript
  U.ve = function () {
    var st = U.st();
    if (!st) return;
    var root = document.getElementById('noidung');
    var nguCanh = U.nguCanhVe();
    var cungNguCanh = U._nguCanhDaVe === nguCanh;
    var truong = cungNguCanh ? U.nhoTruongDangNhap(root) : null;
    var dieuKhien = cungNguCanh && !truong ? U.nhoDieuKhienFocus() : null;
    var chiTietMo = cungNguCanh ? U.nhoChiTietMo(root) : [];
    // ...
    var f = U['m_' + U.man] || U.m_tongquan;
    root.innerHTML = f(); // <-- XÓA VÀ DỰNG LẠI TOÀN BỘ CÂY DOM
    // ...
    U.traChiTietMo(root, chiTietMo);
    U.traTruongDangNhap(root, truong);
    if (!truong) U.traDieuKhienFocus(dieuKhien);
  };
  ```
  - **Bằng chứng**: Mỗi khi state thay đổi, toàn bộ DOM trong `#noidung` bị hủy sạch. Để giải quyết các tác dụng phụ nghiêm trọng (mất con trỏ khi đang gõ, mất focus nút bấm, đóng các thẻ `<details>`), hệ thống phải duy trì hơn 140 dòng mã (`ui.js:2398-2537`) để ghi nhớ trạng thái và cố gắng phục hồi:
    * `U.nhoTruongDangNhap` / `U.traTruongDangNhap`: Lưu `id`, `value`, `selectionStart`, `selectionEnd`, sau khi gán lại giá trị phải tự phát sinh sự kiện giả lập `new window.Event('input', { bubbles: true })` (`ui.js:2441`).
    * `U.nhoDieuKhienFocus` / `U.traDieuKhienFocus`: Duyệt tìm lại phần tử theo danh sách thuộc tính `data-*`.
  - **Hệ quả**:
    * Tiêu tốn CPU do trình duyệt liên tục parse lại chuỗi HTML khổng lồ và layout lại toàn trang (Layout Thrashing).
    * Dễ gây lỗi giật con trỏ hoặc nhảy màn hình nếu người dùng đang nhập liệu trên các ô không có `id` cố định.
    * Trong `web/js/mp.js:142`, cơ chế đồng bộ nền mỗi 8 giây so sánh chữ ký `U.sig() !== U.sigCu`. Nếu có sự kiện máy chủ (hạm đội về, công trình hoàn tất), màn hình sẽ bị vẽ lại ngay lập tức dù người dùng đang soạn thảo tin nhắn hay điền biểu mẫu.

- **[VĐ-04] Chắp vá logic cập nhật cục bộ trong `js/app.js` do hạn chế của Full Re-render**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/js/app.js#L437-L454`
  ```javascript
  if (/^ct-sl-/.test(id)) {
    var bid = id.slice(6), b = G.B(bid), n = Math.max(1, Math.min(10000000, Math.floor(+e.target.value || 1)));
    var gia = document.getElementById('ct-gia-' + bid), tg = document.getElementById('ct-tg-' + bid);
    var nut = document.querySelector('[data-act="xay"][data-id="' + bid + '"]');
    var cost = b ? G.giaCongTrinh(b, n) : null;
    if (b && gia) gia.innerHTML = U.gia(cost, U.ht(), U.st());
    if (b && tg) tg.textContent = G.tg(G.tgXay(U.st(), U.ht(), cost));
    if (nut) {
      nut.textContent = 'Xây ×' + G.so(n);
      nut.classList.toggle('oke', !!b && G.duTien(U.st(), U.ht(), cost) && !G.thieuDK(U.st(), U.ht(), b).length);
    }
  }
  ```
  - **Bằng chứng**: Vì gọi `U.ve()` sẽ phá hủy ô nhập liệu của người dùng, tác giả buộc phải tự viết code can thiệp DOM thủ công trực tiếp ngay trong trình lắng nghe sự kiện `input` của `app.js` cho từng trường hợp: tính giá xây, tính thời gian xây, cập nhật thời gian bay hạm đội (`#hd-tt`).
  - **Hệ quả**: Logic hiển thị bị phân mảnh ở hai nơi: vừa nằm trong template HTML của `ui.js`, vừa nằm rải rác trong các nhánh `if` bắt sự kiện của `app.js`.

---

### 3.3. Xử lý Sự kiện & Rò rỉ Tài nguyên

- **[VĐ-05] Rò rỉ Interval toàn cục khi người dùng Đăng xuất (Logout)**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/js/app.js#L462-L470`
    + `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L685-L712`
  ```javascript
  // js/app.js:462
  APP.batDauNhip = function () {
    setInterval(function () {
      if (!window.ST) return;
      // ...
    }, 1000);
  };
  ```
  - **Bằng chứng**: Hàm `APP.batDauNhip` thiết lập `setInterval` 1 giây một lần nhưng không lưu định danh (`timerId`). Khi người dùng đăng xuất trong `dangXuatCuc` (`web/js/mp.js:685`), `window.ST` được gán về `null`, nhưng tiến trình `setInterval` vẫn tiếp tục chạy vĩnh viễn ở chế độ nền trong suốt vòng đời của tab trình duyệt.
  - **Hệ quả**: Lãng phí tài nguyên tiến trình nền (memory/timer leak) không cần thiết.

- **[VĐ-06] Thiếu sự kiện phím `Enter` để gửi tin trong Phòng Chat**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L627-L643`
  - **Bằng chứng**: Hành động `chat-gui` chỉ được kích hoạt duy nhất khi click chuột vào nút `<button data-act="chat-gui">`. Hai ô nhập tin nhắn `#chat-noi-chung` và `#chat-noi-lienminh` không có bất kỳ trình lắng nghe sự kiện `keydown` phím `Enter` nào.
  - **Hệ quả**: Giảm nghiêm trọng trải nghiệm người dùng trong multiplayer; người chơi phải liên tục chuyển tay từ bàn phím sang chuột để bấm nút "Gửi".

- **[VĐ-07] Bắt sự kiện thẻ `<select id="f-mission">` trong trình lắng nghe `input` thay vì `change`**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/js/app.js#L453`
  ```javascript
  if (id === 'f-mission') U.ve();
  ```
  - **Bằng chứng**: Dòng code này nằm bên trong `document.addEventListener('input', ...)`. Thẻ `<select>` trên các trình duyệt chuẩn ưu tiên phát sự kiện `change`. Trình lắng nghe `change` tại dòng 456-459 lại chỉ kiểm tra `chon-ht`.
  - **Hệ quả**: Trên một số trình duyệt di động hoặc WebKit cũ, việc chọn loại nhiệm vụ hạm đội (Tấn công, Vận chuyển, Do thám...) có thể không kích hoạt vẽ lại form hạm đội tương ứng.

---

### 3.4. Khả năng Tiếp cận (Accessibility / WCAG)

- **[VĐ-08] Vi phạm cấp độ Heading nhảy cóc (Skipped Heading Level - WCAG 2.1 SC 1.3.1)**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/js/ui.js#L1304`
    + `file:///home/linh/linh/thienhadaichien/js/ui.js#L1373`
    + `file:///home/linh/linh/thienhadaichien/js/ui.js#L1396`
  - **Bằng chứng**: Tiêu đề từng nhóm công trình/nghiên cứu trong màn hình là thẻ `<h2>` (ví dụ `ui.js:1343: <h2>Khai thác</h2>`), nhưng bên trong các card đơn vị lại nhảy cóc trực tiếp sang `<h4>` (`ui.js:1304: <h4>Mỏ Kim Loại</h4>`), hoàn toàn không có thẻ `<h3>`.
  - **Hệ quả**: Vi phạm trực tiếp nguyên tắc đã cam kết trong `design.md:369` (*"Heading theo đúng h1 → h2 → h3; mỗi màn có đúng một h1"*). Phá vỡ cấu trúc cây tài liệu của Screen Reader, khiến người khiếm thị bị mất định hướng phân cấp thông tin.

- **[VĐ-09] Thiếu Accessible Name ngữ cảnh cho các ô nhập liệu**:
  - **Vị trí**: `file:///home/linh/linh/thienhadaichien/js/ui.js#L1329`
  ```javascript
  h += '<div class="ct"><label class="mo sz">Lô <input id="ct-sl-' + b.id + '" type="number" min="1" max="10000000" value="' + n + '" style="width:92px"></label>...';
  ```
  - **Bằng chứng**: Thẻ `<input>` chỉ được bọc trong chữ "Lô". Trình đọc màn hình khi focus vào ô này sẽ thông báo *"Lô, ô nhập số, giá trị 1"*, hoàn toàn không chứa ngữ cảnh tên công trình (ví dụ *"Số lượng xây Mỏ Kim Loại"*).
  - **Đối chiếu**: Ở màn hình Xưởng Đóng Tàu (`ui.js:1416`), tác giả đã làm đúng khi gán `aria-label="Số lượng ' + U.esc(u.ten) + '"`. Màn hình Công Trình đã bị bỏ sót thuộc tính này.

- **[VĐ-10] Chưa tận dụng thẻ `<dialog>` native cho Hộp thoại**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/index.html#L70`
    + `file:///home/linh/linh/thienhadaichien/web/index.html#L101`
  - **Bằng chứng**: Modal vẫn sử dụng thẻ `<div id="hop-thoai" class="hop-thoai" role="dialog" aria-modal="true">` và điều khiển hiển thị bằng `style.display = 'flex'/'none'`.
  - **Hệ quả**: Không tận dụng được các API hiện đại chuẩn trình duyệt (`HTMLDialogElement.showModal()`, `close()`), vốn tự động quản lý top-layer, vô hiệu hóa tương tác nền (inert) và bẫy phím tắt mà không cần code JavaScript thủ công.

---

### 3.5. CSS & Kiến trúc Giao diện

- **[VĐ-11] Trùng lặp hoàn toàn các khối luật CSS (Redundant / Dead Code)**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/css/style.css#L417-L421`
    + `file:///home/linh/linh/thienhadaichien/css/style.css#L440-L443`
    + `file:///home/linh/linh/thienhadaichien/css/style.css#L321-L327`
  - **Bằng chứng**:
    ```css
    /* style.css:417-421 */
    .kq{padding:var(--space-xs) var(--space-sm);margin:var(--space-xs) 0;border:var(--rule-thin) solid var(--color-control-rule);border-radius:var(--radius-control)}
    .kq.kq-tomtat{margin:0 0 var(--space-sm)}
    .kq.thang{border-color:var(--color-success);background:var(--color-success-surface)}
    .kq.thua{border-color:var(--color-danger);background:var(--color-danger-surface)}
    .kq.hoa{border-color:var(--color-warning);background:var(--color-warning-surface)}

    /* style.css:440-443 — LẶP LẠI 100% */
    .bc .kq{padding:var(--space-xs) var(--space-sm);margin:var(--space-xs) 0;border:var(--rule-thin) solid var(--color-control-rule);border-radius:var(--radius-control)}
    .bc .kq.thang{border-color:var(--color-success);background:var(--color-success-surface)}
    .bc .kq.thua{border-color:var(--color-danger);background:var(--color-danger-surface)}
    .bc .kq.hoa{border-color:var(--color-warning);background:var(--color-warning-surface)}
    ```
    Ngoài ra, thanh tiến trình tại dòng 326-327 (`.dash-the-lon .bar>i`) trùng lặp hoàn toàn với dòng 321-322 (`.pill-chiso .bar>i`).
  - **Hệ quả**: Dư thừa dung lượng CSS tải về, tạo nợ kỹ thuật khi muốn thay đổi kiểu dáng kết quả trận đấu.

- **[VĐ-12] Rò rỉ biến Legacy Tokens từ mã nguồn JavaScript**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/js/ui.js#L608`
    + `file:///home/linh/linh/thienhadaichien/js/ui.js#L613`
    + `file:///home/linh/linh/thienhadaichien/web/js/mp.js#L60`
    + `file:///home/linh/linh/thienhadaichien/css/tokens.css#L84-L102`
  - **Bằng chứng**:
    ```javascript
    // js/ui.js:608
    h += chip(s.hs < 1 ? 'var(--do)' : 'var(--vang)', 'Điện', ...);
    // js/ui.js:613
    h += chip('var(--cam)', 'Bảo trì', ...);
    // web/js/mp.js:60
    e.style.color = ok ? 'var(--luc)' : (dangThuLai ? 'var(--cam)' : 'var(--do)');
    ```
    Mặc dù `design.md:408-409` đặt mục tiêu xóa bỏ alias legacy (`--den`, `--cam`, `--luc`, `--do`...), mã nguồn JavaScript vẫn đang hardcode các biến cũ này vào inline style, khiến việc loại bỏ alias legacy trong `tokens.css` chưa thể thực hiện.

- **[VĐ-13] Lạm dụng Inline Style cố định kích thước (`style="width: ...px"`)**:
  - **Vị trí**: Hơn 30 vị trí trong `js/ui.js` (ví dụ `L1330`, `L1416`, `L1488`, `L1744`, `L1747`, `L1932`, `L1935`, `L1989`) và `web/js/mp.js` (`L355`, `L356`).
  - **Bằng chứng**: Các ô nhập liệu bị gán cứng kích thước inline: `style="width:92px"`, `style="width:80px"`, `style="width:70px"`, `style="width:120px"`.
  - **Hệ quả**: Phá vỡ tính linh hoạt của responsive trên màn hình siêu hẹp (<360px), khó duy trì tính đồng bộ của hệ thống khoảng cách (spacing tokens).

---

### 3.6. Responsive / Mobile & Độ lệch so với `design.md`

- **[VĐ-14] Thiếu hoàn toàn các Breakpoint cho màn hình lớn (1280px / 1440px) theo quy chuẩn `design.md`**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/design.md#L352-L355`
    + `file:///home/linh/linh/thienhadaichien/css/style.css#L169-L173`
    + `file:///home/linh/linh/thienhadaichien/css/style.css#L503-L608`
  - **Bằng chứng**: `design.md` quy định 5 cấp độ responsive:
    * *1280–1439px*: Rail + Secondary Nav đầy đủ, bố cục Content/Detail theo tỷ lệ **8/4**.
    * *≥1440px*: Bố cục Content/Detail theo tỷ lệ **9/3**, có giới hạn chiều rộng bảng và độ dài dòng.
    Trong `css/style.css`, chỉ tồn tại 2 media query kích thước: `max-width: 959px` (dòng 507) và `max-width: 639px` (dòng 549). Toàn bộ dải màn hình desktop từ 960px trở lên đều dùng chung một lưới 3 cột cứng (`var(--size-workspace-rail) var(--size-secondary-nav) minmax(0,1fr)`), hoàn toàn không có layout 8/4, 9/3 hay cột Context Panel.
  - **Hệ quả**: Chưa đáp ứng đầy đủ cam kết kiến trúc Shell đã được chốt trong `design.md`.

- **[VĐ-15] Bản đồ Thiên Hà bị tràn nút và phụ thuộc cuộn ngang trên Mobile**:
  - **Vị trí**:
    + `file:///home/linh/linh/thienhadaichien/js/ui.js#L1785-L1818`
    + `file:///home/linh/linh/thienhadaichien/css/style.css#L509`
  - **Bằng chứng**: Cột "Hành động" của Bản đồ Thiên hà chứa class `khong-xuong-dong` gộp từ 4 đến 6 nút bấm liên tiếp (`Do thám`, `Tấn công`, `Tuyên chiến`, `Tiếp tế`, `Đóng quân`, `Gửi thư`, `Thu hồi`). Trên mobile, bảng bị ép cuộn ngang (`overflow-x: auto`).
  - **Hệ quả**: Vi phạm định hướng `design.md:358-359` (*"Bảng rộng phải biến thành priority view/card hoặc disclosure trên mobile, không chỉ cuộn ngang"*). Người chơi thao tác trên màn hình cảm ứng rất dễ ấn nhầm vào nút Tấn công hoặc Tuyên chiến khi vuốt ngang.

---

## 4. Đề xuất cải tiến

| STT | Đề xuất cải tiến | Lợi ích mang lại | Độ khó | Mức độ ưu tiên |
| :--- | :--- | :--- | :---: | :---: |
| **01** | **Tách `ui.js` thành kiến trúc module theo miền nghiệp vụ (Domain-driven Modules)**<br>- Tách thành: `ui-core.js` (primitives, modal, toast), `ui-viewmodels.js` (tính toán tình hình, alerts, ma trận), `ui-shell.js` (rail, menu, icons, situation strip) và các module màn hình: `ui-command.js`, `ui-development.js`, `ui-combat.js`, `ui-alliance.js`, `ui-system.js`. | Giảm kích thước file, dễ bảo trì, nhiều lập trình viên có thể làm việc song song mà không sợ xung đột mã nguồn. | Trung bình | **Cao (P1)** |
| **02** | **Hợp nhất giao diện Multiplayer vào Core Registry, xóa bỏ monkey-patching**<br>- Tích hợp `m_bangtin`, `m_chat`, `m_taikhoan` và form liên minh trực tiếp vào registry của `ui.js` với cờ capability (`modes: ['mp']`).<br>- Chuyển `web/js/mp.js` về đúng vai trò Data Driver thuần túy (chỉ gọi API và nạp state). | Triệt tiêu sự phân mảnh giữa solo và multiplayer, loại bỏ hoàn toàn việc ghi đè hàm `U.m_lienminh` và `APP.ACT`. | Trung bình | **Cao (P1)** |
| **03** | **Chuyển đổi từng bước từ Full HTML Re-render sang Targeted Component Updates**<br>- Chia nhỏ hàm `U.ve()` thành các hàm cập nhật độc lập: `veThanhRes()`, `veCanh()`, `veDauMan()`, `veNoiDung()`.<br>- Đối với các màn hình có ô nhập liệu (Công trình, Nghiên cứu, Hạm đội), chỉ re-render nội dung cần thiết thay vì đập đi xây lại toàn bộ `#noidung`. | Loại bỏ hiện tượng nháy màn hình, triệt tiêu nguy cơ mất con trỏ khi gõ, cho phép loại bỏ hơn 140 dòng code "vá víu" focus/selection. | Khó | **Cao (P1)** |
| **04** | **Chuẩn hóa Accessibility & Khắc phục Heading Hierarchy**<br>- Điều chỉnh các thẻ `<h4>` trong card công trình/nghiên cứu/xưởng thành `<h3>` để tuân thủ thứ bậc `h1 → h2 → h3`.<br>- Bổ sung `aria-label` cho ô nhập số lượng lô công trình (`ct-sl-*`).<br>- Nghiên cứu chuyển đổi `#hop-thoai` sang thẻ native `<dialog>`. | Đạt chuẩn WCAG 2.1 AA, nâng cao trải nghiệm cho người dùng khiếm thị, tuân thủ đúng cam kết trong `design.md`. | Dễ | **Cao (P1)** |
| **05** | **Tối ưu hóa trải nghiệm tương tác Mobile cho Bản đồ Thiên Hà và Chat**<br>- Bổ sung trình bắt sự kiện phím `Enter` trong khung chat.<br>- Thiết kế lại cột hành động của Bản đồ Thiên Hà trên mobile thành nút mở Menu hành động dạng Bottom Sheet thay vì hàng nút cuộn ngang dài dặc. | Thao tác chat thuận tiện; ngăn ngừa rủi ro bấm nhầm các nút chiến sự nguy hiểm trên thiết bị di động. | Trung bình | **Trung bình (P2)** |
| **06** | **Dọn dẹp CSS: Xóa mã trùng lặp, thanh lọc Legacy Tokens và bỏ Inline Styles**<br>- Gộp các class trùng `.kq` và `.bc .kq`, dọn dẹp các thanh progress bar trùng lặp.<br>- Thay thế toàn bộ các chuỗi `var(--do)`, `var(--cam)`, `var(--luc)` còn sót trong JS bằng semantic token, tiến tới xóa 19 alias cũ trong `tokens.css`.<br>- Thay thế các inline `style="width: ...px"` bằng các class tiện ích dạng token (`.w-input-sm`, `.w-input-md`). | Giảm dung lượng stylesheet, tăng tính nhất quán và dễ dàng bảo trì design token trong tương lai. | Dễ | **Trung bình (P2)** |
| **07** | **Bổ sung các Media Queries cho Desktop lớn (1280px / 1440px)**<br>- Hiện thực hóa quy chuẩn layout 8/4 và 9/3 với Context Panel theo đúng thiết kế của `design.md`. | Khai thác hiệu quả không gian hiển thị của màn hình độ phân giải cao mà không làm giảm mật độ thông tin. | Trung bình | **Thấp (P3)** |
| **08** | **Bổ sung cơ chế dọn dẹp Timer (`clearInterval`) khi Logout**<br>- Lưu định danh của `setInterval` trong `APP.batDauNhip` và thực hiện `clearInterval` trong hàm `dangXuatCuc`. | Ngăn chặn rò rỉ bộ nhớ và tiến trình chạy ngầm vô ích khi người dùng đã đăng xuất. | Dễ | **Thấp (P3)** |
