# Báo cáo Đánh giá Chất lượng Mã nguồn & Khả năng Bảo trì (Seat S5)

> **Dự án**: Thiên Hà Đại Chiến (`thien-ha-dai-chien`) — v1.36.0  
> **Người thực hiện**: Reviewer Chất lượng Mã & Khả năng Bảo trì (Seat S5)  
> **Phạm vi đánh giá**: Toàn bộ `js/`, `server/`, `web/`, `dist/`, `tools/` (`smoke.js`, `test-server.js`, `test-tai.js`, `test-ui-contracts.js`, `test-mp-ui.mjs`, `test-visual-gate.mjs`, `build.js`), `package.json`.  
> **Cam kết**: Chỉ đọc mã nguồn, lập báo cáo độc lập, không thay đổi mã dự án.

---

## 1. Tóm tắt

Dự án **Thiên Hà Đại Chiến** là một bản phục dựng webgame chiến thuật vũ trụ quy mô ~16.800 dòng mã (Core JS: 6.9k dòng, Server: 2.8k dòng, Web: 0.8k dòng, Tools/Tests: 5.8k dòng, HTML/CSS: ~0.5k dòng). Điểm sáng vượt trội của dự án là triết lý **Zero Dependency** ở runtime (chỉ dùng Node.js built-ins như `node:sqlite`, `http`, `crypto`), tốc độ thực thi rất nhanh, test suite chạy 726 kiểm tra chỉ mất dưới 4 giây, và kiến trúc giao dịch/khoá concurrency hai đế quốc được thiết kế kỹ lưỡng.

Tuy nhiên, mã nguồn đang mang nhiều gánh nặng kỹ thuật điển hình của phong cách ES5 vanilla: chia sẻ logic qua cơ chế `eval` vào `window.G`, tồn tại nhiều hàm siêu dài (>200 dòng đến >1.700 dòng), sự trùng lặp tính toán giữa `js/` và `server/`, các hàm dead code sót lại từ state cũ, thiếu vắng hoàn toàn bộ công cụ linting/formatting (ESLint/Prettier), không có pipeline CI/CD tự động, và đặc biệt **bộ test tải `test-tai.js` đang bị gãy âm thầm** do lệch phiên bản state v6/v7 nhưng không nằm trong lệnh `npm test`.

---

## 2. Điểm mạnh

1. **Zero-Dependency & Tốc độ thực thi vượt trội**:
   - Runtime phía máy chủ hoàn toàn không có `node_modules` bên thứ 3; toàn bộ cơ chế lưu trữ dùng `node:sqlite` tích hợp sẵn của Node.js, mã hóa mật khẩu dùng `crypto.scryptSync`.
   - Thời gian chạy bộ kiểm thử chính (`npm test`: `test-ui-contracts.js`, `smoke.js`, `test-server.js`) đạt 726/726 pass trong ~3.5 giây.
2. **Kiến trúc Giao dịch & Concurrency bảo vệ toàn vẹn dữ liệu máy chủ**:
   - `server/world.js` tổ chức đơn vị công việc (unit-of-work) với `batDau()`, `ketThuc()`, và `choChay()` bọc trong giao dịch SQLite, ngăn ngừa trạng thái lưu nửa vời khi xảy ra lỗi.
   - Cơ chế khoá đối xứng theo thứ tự ID (`TheGioi.prototype.choMua` tại lines 498-500) giúp phòng chống triệt để tình trạng dead-lock khi hai người chơi đồng thời mua đơn của nhau.
   - Giao chiến PvP đa bên giải quyết theo horizon tick cố định (`TheGioi.prototype.danhNguoi` lines 887-889), tránh việc mốc thời gian bị trôi khi request kéo dài qua ranh giới giây.
3. **Quy trình Di chuyển Dữ liệu (State Migration) nhiều phiên bản chặt chẽ**:
   - Hệ thống giữ trọn chuỗi migration từ v3 -> v4 -> v5 -> v6 -> v7 trong `js/engine.js` (lines 237-434) và kiểm thử tính bất biến/idempotency nghiêm ngặt trong `tools/smoke.js`. Các marker (`moHinhCT`, `moHinhNhip`, `moHinhQuyDao`, `moHinhKT`) bảo đảm state cũ không bị phạt sai quy tắc.
4. **Hệ thống Kiểm thử nhiều tầng không phụ thuộc framework**:
   - Bao phủ từ kiểm tra contract chuỗi tĩnh (`test-ui-contracts.js`), kiểm thử logic lõi (`smoke.js`), kiểm thử tích hợp giao thức HTTP + database thực tế (`test-server.js`) đến kịch bản E2E trình duyệt (`test-mp-ui.mjs`, `test-visual-gate.mjs`).

---

## 3. Vấn đề & Bằng chứng mã nguồn

### 3.1. Trùng lặp logic giữa `js/` và `server/` (Duplicated Logic)
- **Sao chép logic tính toán thuế và giao dịch chợ**:
  - `server/rules.js:1-2` khẳng định: *"Client và server chạy CÙNG một bộ luật — không có hai bản sao logic"*. Tuy nhiên, logic khớp đơn mua hàng tại `server/world.js:510-524` (`TheGioi.prototype.choMua`) đã sao chép lại gần như nguyên vẹn logic từ `js/thitruong.js:88-118` (`G.muaDon`): từ công thức tính thuế (`G.KINH_TE_V1.thueSieuThi`, `thueTuDo`), trừ Galana người mua, tính doanh thu thực nhận sau thuế cho người bán (`Math.floor(tongGL * (1 - thue))`), đến việc đẩy hàng vào hàng đợi `p.giaoHang` với thời gian trễ 6 giờ.
  - Hậu quả: Nếu sau này quy tắc thuế hay thời gian giao hàng được điều chỉnh ở `js/thitruong.js`, máy chủ sẽ chạy sai lệch nếu không được sửa đồng thời tại `server/world.js`.
- **Phân mảnh xử lý tên lửa và phòng thủ**:
  - `server/world.js:1396-1442` (`TheGioi.prototype.tenLuaNguoi`) và `js/fleet.js:1218-1242` (`G.tenLuaToiDich`): Logic trừ tên lửa đánh chặn `interceptor` trong kho hành tinh (`dp.mis.interceptor -= kq.chan`) và phát tin chiến sự bị tách thành hai luồng riêng biệt giữa PvP và chơi đơn NPC thay vì trừu tượng hóa qua cùng một hàm nghiệp vụ.
- **Trùng lặp hàm tiện ích DOM**:
  - `js/app.js:22-23`: định nghĩa `function soO(id)` và `function soO2(e)`.
  - `web/js/mp.js:435`: lại định nghĩa lại chính xác `function soO2(e) { return e ? Math.max(0, Math.floor(+e.value || 0)) : 0; }`.

### 3.2. Quy ước đặt tên & Tính nhất quán (Inconsistent Naming)
- **Hỗn loạn phong cách định danh mốc thời gian**:
  - Cùng biểu diễn thời điểm timestamp (giây), dự án dùng lẫn lộn: `den_t` (snake_case ngắn), `denT` (`server/world.js:798`), `giuDen_t` (nửa Việt nửa snake), `xongAt` (camelCase đuôi Anh), `taoAt`, `roiLuc` (camelCase đuôi Việt), `giuLuc`, `lastTick` (camelCase thuần Anh), `hetHan`.
- **Tên viết tắt khó hiểu trong cơ sở dữ liệu (`server/db.js`)**:
  - Các truy vấn prepared statement được đặt tên co cụm 4-7 ký tự không theo quy tắc: `hgCan`, `hdGiuDen`, `htGet`, `tkDem`, `tkTheoId`, `choGet`, `choThem`, `choTru`, `choXoaId`. Lập trình viên mới đọc vào không thể hiểu `hgCan` nghĩa là gì nếu không đọc trực tiếp câu lệnh SQL.
- **Lạm dụng hàm viết tắt 1-2 ký tự**:
  - `js/data.js:52`: `G.S`, `G.D`, `G.BB`, `G.C`, `G.R`, `G.B`, `G.M`, `G.LHT`.
  - Toàn bộ tầng hiển thị gán vào biến toàn cục một chữ cái `U` (`window.U`), vừa chịu trách nhiệm render HTML, vừa điều hướng, vừa giữ trạng thái input form.
- **Lệch thông tin phiên bản giữa các file**:
  - `package.json:3` ghi nhận `"version": "1.36.0"`.
  - `js/data.js:12` vẫn ghi `G.VERSION = '1.35b-r2'` kèm chú thích cũ `// state v6: nhịp dân sự + hạm đội giữ quỹ đạo thật`, trong khi hệ thống đã chuyển sang state v7.

### 3.3. Hàm quá dài / Thiết kế Monolithic (Excessively Long Functions)
- **File test monolithic vượt ngưỡng bảo trì**:
  - `tools/test-server.js:46-1767`: Khối thực thi test server dài **1.722 dòng** nằm liền tù tì trong một hàm async duy nhất, trộn lẫn từ khởi tạo server, đăng ký tài khoản, PvP, liên minh, chat, ngân hàng, thị trường đến kiểm tra crash recovery.
  - `tools/test-mp-ui.mjs:163-989`: Hàm kịch bản `chay()` kéo dài **827 dòng**.
- **Hàm nghiệp vụ máy chủ ôm đồm quá nhiều trách nhiệm**:
  - `server/world.js:880-1115` (`TheGioi.prototype.danhNguoi`): Hàm dài **236 dòng**, đảm nhiệm cùng lúc: đồng bộ mốc thời gian, kiểm tra quyền đánh, khoá danh sách đế quốc liên quan, tua state đến T, kiểm tra bảo vệ tân thủ, thu thập hạm đội hỗ trợ, mô phỏng chiến trận, chia cướp bóc tài nguyên, tính phế liệu, lưu dữ liệu đa bên và gửi bảng tin toàn vũ trụ.
- **God-file giao diện client (`js/ui.js` — 2.870 dòng)**:
  - `U.tinhViecCanXuLy` (lines 211-409): **199 dòng**.
  - `U.m_tongquan` (lines 1035-1222): **188 dòng** mã ghép chuỗi HTML.
  - `U.m_huongdan` (lines 2230-2385): **156 dòng** thuần chuỗi văn bản HTML tĩnh.
  - `U.m_hamdoi` (lines 1585-1729): **145 dòng**.
  - Toàn bộ giao diện sinh bằng cách nối chuỗi thủ công (`h += '...'`), không có component hóa hay template engine, dẫn tới nguy cơ lỗi cú pháp thẻ đóng/mở và cực kỳ khó tái cấu trúc.
- **Xử lý sự kiện hạm đội**:
  - `js/fleet.js:390-548` (`G.hamToiDich`): dài **159 dòng** với cấu trúc rẽ nhánh `if (f.mission === ...)` lồng nhau phức tạp cho 6 loại nhiệm vụ.

### 3.4. Dead Code & Tàn dư tương thích (Dead Code & Obsolete Logic)
- **Các hàm mồ côi không có bất kỳ nơi nào gọi**:
  - `js/engine.js:656`: `G.capDangXay` (hàm đếm công trình theo cấp cũ bằng vòng lặp `n++`, đã bị thay thế hoàn toàn bởi `G.soDangXay` tại line 660 từ khi chuyển sang mô hình số lượng ở state v4).
  - `js/engine.js:172`: `G.thueDanSuChuKy` (được định nghĩa nhưng không có nơi nào sử dụng).
  - `js/engine.js:225`: `G.conLaiNghienCuu` (định nghĩa mồ côi).
  - `js/thitruong.js:38`: `G.donChoCua` (không có file nào gọi ngoài chính định nghĩa của nó).
  - `js/util.js:22`: `G.tocDoText` (hàm format số không có caller).
  - `server/world.js:779`: `TheGioi.prototype.dongBoChiMuc` (hàm đồng bộ chỉ mục công khai bọc transaction nhưng không được server hay CLI nào gọi tới).
- **Lưu trữ build artifact trực tiếp trong Git**:
  - `dist/thien-ha-dai-chien.html` (419 KB) và `dist/artifact.html` (418 KB) là các file do `tools/build.js` sinh ra nhưng lại được theo dõi trực tiếp trong git repository (`git ls-files dist/`). Mỗi lần chạy build sẽ làm bẩn working tree và phình to lịch sử commit git một cách không cần thiết.

### 3.5. Độ phủ và Kiến trúc Test (Test Coverage & Failures)
- **Test tải đang thất bại âm thầm (`tools/test-tai.js`)**:
  - Khi chạy trực tiếp `node tools/test-tai.js`, kết quả trả về:
    `✗ mọi state tải chạy trên contract v6 đầy đủ marker (1 lỗi / 72 kiểm tra đạt)`
  - Nguyên nhân: State đã được nâng lên phiên bản 7 (`G.STATE_VERSION = 7`), nhưng tại `tools/test-tai.js:68-70` vẫn kiểm tra cứng `mau.v === 6`.
  - Nguy cơ: Do `package.json` chỉ khai báo `"test": "node tools/test-ui-contracts.js && node tools/smoke.js && node tools/test-server.js"`, file `test-tai.js` bị bỏ quên và không ai biết nó đã hỏng từ đợt nâng cấp state v7.
- **Thiếu test runner chuẩn và đo lường độ phủ (Coverage)**:
  - Dự án tự triển khai cơ chế kiểm tra lỗi thủ công ở từng file (`var loi = 0; function ktra(...)`). Không sử dụng runner chuẩn sẵn có của Node (`node:test`, `node:assert`).
  - Không có công cụ đo coverage (`c8`), không thể thống kê được tỷ lệ bao phủ dòng lệnh và nhánh logic của mã nguồn.
- **Kịch bản kiểm thử giao diện văng lỗi trên môi trường sạch**:
  - `tools/test-mp-ui.mjs` và `tools/test-visual-gate.mjs` phụ thuộc Playwright nhưng `package.json` không có trường `devDependencies`. Người mới clone repo chạy `npm run test:ui` hoặc `npm run test:visual` lập tức gặp lỗi `ERR_MODULE_NOT_FOUND`.

### 3.6. Thiếu Lint/Format, CI/CD, và Quy ước Commit (Tooling & Standards)
- **Hoàn toàn không có bộ công cụ Lint và Format**:
  - Dự án không có `.eslintrc.*`, `eslint.config.*`, `.prettierrc`, hay `.editorconfig`.
  - Toàn bộ codebase viết theo chuẩn ES5 `var`, biến bị hoisting tự do, tiềm ẩn rủi ro ghi đè biến trong phạm vi hàm và không thể phát hiện lỗi chính tả biến lúc viết code.
- **Không có quy trình CI/CD tự động**:
  - Thư mục `.github/` không tồn tại. Mọi commit và pull request hiện tại không được tự động chạy test kiểm thử hồi quy (regression test) trên môi trường cô lập.
- **Quy ước Commit chắp vá và phân mảnh**:
  - Lịch sử Git thể hiện sự thiếu đồng nhất: lúc dùng Conventional Commits (`fix: ...`, `ui: ...`), lúc dùng tiêu đề tiếng Việt hoa không tiền tố (`Báo cáo UI: ...`, `Plan: ...`), lúc dùng trực tiếp tên hàm (`choMua: ...`, `doBoXuong: ...`), lúc dùng danh mục tính năng (`thị trường: ...`).
  - Không có công cụ kiểm soát commit tự động (`commitlint` hoặc pre-commit hook).

### 3.7. Vấn đề Chất lượng Khác: Cơ chế Nạp Mã & An toàn XSS
- **Sử dụng `eval` để chia sẻ mã giữa client và server**:
  - `server/rules.js:15` nạp các file trong `js/` bằng `eval(ma)` để đưa vào `global.window.G`. Nếu có lỗi cú pháp hoặc ngoại lệ runtime trong các file này, stack trace trỏ về chuỗi eval nặc danh, gây khó khăn lớn khi gỡ lỗi.
- **Thiếu sót ký tự nháy đơn trong hàm làm sạch HTML (`U.esc`)**:
  - `js/ui.js:13-16`: `U.esc` chuyển đổi `&`, `<`, `>`, `"`, nhưng **bỏ qua dấu nháy đơn `'`**. Nếu dữ liệu do người dùng nhập (như tên hạm đội, tên liên minh) được render vào một thuộc tính HTML dùng dấu nháy đơn (`attr='...'`), kẻ xấu có thể thoát chuỗi để thực hiện tấn công XSS.

---

## 4. Đề xuất cải tiến

| STT | Đề xuất cải tiến | Lợi ích mang lại | Độ khó | Mức ưu tiên |
|:---:|:---|:---|:---:|:---:|
| 1 | **Sửa test-tai.js và đưa vào `npm test`** | Sửa assertion `mau.v === 7` tại `tools/test-tai.js:68`, đưa lệnh chạy tải vào script test hoặc tạo lệnh `npm run test:all` để ngăn lỗi kiểm thử bị bỏ quên. | Rất dễ | **P0 (Cần làm ngay)** |
| 2 | **Khai báo devDependencies trong package.json** | Thêm `playwright` vào `devDependencies` hoặc tách runner kiểm tra tùy chọn với thông báo hướng dẫn cài đặt rõ ràng, tránh văng crash `ERR_MODULE_NOT_FOUND`. | Dễ | **P0 (Cần làm ngay)** |
| 3 | **Cấu hình CI Pipeline cơ bản (GitHub Actions)** | Tạo `.github/workflows/ci.yml` tự động chạy `npm test` và `npm run build` trên mọi push/PR, bảo đảm không bị vỡ hợp đồng mã nguồn. | Dễ | **P1 (Quan trọng)** |
| 4 | **Bổ sung ESLint + Prettier + .editorconfig** | Bắt lỗi biến chưa khai báo/unused, ép chuẩn định dạng thụt lề nhất quán, loại bỏ biến rác và chuẩn hóa cú pháp trên toàn repo. | Trung bình | **P1 (Quan trọng)** |
| 5 | **Vá an toàn cho hàm `U.esc`** | Bổ sung `.replace(/'/g, '&#39;')` vào `js/ui.js:15` để phòng chống triệt để lỗi XSS đối với các thuộc tính bọc nháy đơn. | Rất dễ | **P1 (Quan trọng)** |
| 6 | **Dọn dẹp triệt để Dead Code & cập nhật version** | Xoá các hàm mồ côi (`G.capDangXay`, `G.thueDanSuChuKy`, `G.conLaiNghienCuu`, `G.donChoCua`, `G.tocDoText`, `TheGioi.prototype.dongBoChiMuc`) và đồng bộ `G.VERSION` trong `js/data.js:12` lên `1.36.0`. | Dễ | **P1 (Quan trọng)** |
| 7 | **Tái sử dụng luật Chợ (DRY) giữa `server/` và `js/`** | Tái cấu trúc `TheGioi.prototype.choMua` (`server/world.js`) gọi trực tiếp hàm nghiệp vụ `G.muaDon` (`js/thitruong.js`), loại bỏ việc copy-paste 30 dòng tính thuế và hàng đợi. | Trung bình | **P2 (Trung hạn)** |
| 8 | **Đưa `dist/` vào `.gitignore` và tách khỏi Git** | Loại bỏ `dist/artifact.html` và `dist/thien-ha-dai-chien.html` khỏi git tracking, chỉ sinh ra khi build hoặc phát hành release, giúp lịch sử commit gọn gàng. | Dễ | **P2 (Trung hạn)** |
| 9 | **Chia nhỏ các file và hàm khổng lồ (God-files)** | Tách `js/ui.js` (2.8k dòng) thành các module view nhỏ hơn; bóc tách `TheGioi.prototype.danhNguoi` (236 dòng) thành các helper chuyên biệt (kiểm tra điều kiện, mô phỏng, xử lý chiến lợi phẩm, ghi log). | Khó | **P2 (Trung hạn)** |
| 10 | **Chuẩn hóa quy ước đặt tên & Conventional Commits** | Thống nhất đặt tên timestamp dạng `_at` hoặc `_luc`, chuyển các query SQLite sang tên định danh rõ ràng, áp dụng `commitlint` chuẩn hóa thông điệp git. | Trung bình | **P3 (Dài hạn)** |
